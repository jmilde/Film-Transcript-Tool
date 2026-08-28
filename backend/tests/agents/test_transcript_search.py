import uuid

import pytest
from app.agents import transcript_search as agent_module
from app.agents.transcript_search import ChatDeps, Citation, transcript_agent
from app.models.embedding import TranscriptChunk
from app.models.folder import Folder
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.user import User
from app.models.video import Video
from pydantic_ai.messages import ModelMessage, ModelResponse, ToolCallPart, ToolReturnPart
from pydantic_ai.models.function import AgentInfo, FunctionModel
from sqlalchemy.orm import Session


def _project_and_video(db: Session, user: User) -> tuple[Project, Video]:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db.add(project)
    db.flush()
    db.add(ProjectMembership(project_id=project.id, user_id=user.id, role=MembershipRole.OWNER))
    folder = Folder(project_id=project.id, name="F", created_by=user.id, updated_by=user.id)
    db.add(folder)
    db.flush()
    video = Video(
        folder_id=folder.id,
        project_id=project.id,
        name="clip",
        original_filename="clip.mp4",
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(video)
    db.flush()
    return project, video


def _fake_chunk(video: Video, *, text: str = "hello world") -> TranscriptChunk:
    # Never persisted — the tool only reads attributes off it, and search_chunks
    # itself is monkeypatched, so a plain unmanaged instance is enough.
    return TranscriptChunk(
        id=uuid.uuid4(),
        video_id=video.id,
        speaker_name="Alice",
        start_time=1.0,
        text=text,
    )


def _has_tool_return(messages: list[ModelMessage]) -> bool:
    return any(isinstance(part, ToolReturnPart) for part in messages[-1].parts)


def test_search_transcripts_tool_invoked_with_expected_query(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, video = _project_and_video(db_session, user)
    chunk = _fake_chunk(video)
    captured_queries: list[str] = []

    def fake_search_chunks(
        session: Session, project_id: uuid.UUID, query: str
    ) -> list[TranscriptChunk]:
        captured_queries.append(query)
        return [chunk]

    monkeypatch.setattr(agent_module, "search_chunks", fake_search_chunks)

    def model_function(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        if not _has_tool_return(messages):
            return ModelResponse(
                parts=[ToolCallPart("search_transcripts", {"query": "castle scene"})]
            )
        return ModelResponse(
            parts=[
                ToolCallPart(
                    "final_result",
                    {
                        "answer": "It's about a castle.",
                        "citations": [{"marker": 1, "chunk_id": str(chunk.id)}],
                    },
                )
            ]
        )

    deps = ChatDeps(session=db_session, project_id=project.id)
    with transcript_agent.override(model=FunctionModel(model_function)):
        result = transcript_agent.run_sync("Tell me about the castle", deps=deps)

    assert captured_queries == ["castle scene"]
    assert deps.seen_chunk_ids == {chunk.id}
    assert result.output.citations == [Citation(marker=1, chunk_id=chunk.id)]


def test_citation_naming_unreturned_chunk_would_be_dropped_by_the_guard(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project, video = _project_and_video(db_session, user)
    chunk = _fake_chunk(video)
    hallucinated_id = uuid.uuid4()

    monkeypatch.setattr(
        agent_module,
        "search_chunks",
        lambda session, project_id, query: [chunk],
    )

    def model_function(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        if not _has_tool_return(messages):
            return ModelResponse(parts=[ToolCallPart("search_transcripts", {"query": "castle"})])
        return ModelResponse(
            parts=[
                ToolCallPart(
                    "final_result",
                    {
                        "answer": "...",
                        "citations": [
                            {"marker": 1, "chunk_id": str(chunk.id)},
                            {"marker": 2, "chunk_id": str(hallucinated_id)},
                        ],
                    },
                )
            ]
        )

    deps = ChatDeps(session=db_session, project_id=project.id)
    with transcript_agent.override(model=FunctionModel(model_function)):
        result = transcript_agent.run_sync("Tell me about the castle", deps=deps)

    # The model did cite a chunk_id the tool never returned...
    assert {c.chunk_id for c in result.output.citations} == {chunk.id, hallucinated_id}

    # ...which is exactly what services/chat.py's hallucination guard filters
    # out: only chunk_ids in deps.seen_chunk_ids survive.
    guarded = [c for c in result.output.citations if c.chunk_id in deps.seen_chunk_ids]
    assert guarded == [Citation(marker=1, chunk_id=chunk.id)]
