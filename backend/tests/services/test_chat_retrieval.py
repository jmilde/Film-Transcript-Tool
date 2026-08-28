from decimal import Decimal

import pytest
from app.embeddings import factory as embeddings_factory
from app.embeddings.base import EmbeddingsProvider
from app.models.embedding import EMBEDDING_DIMENSION, TranscriptChunk
from app.models.folder import Folder
from app.models.membership import MembershipRole, ProjectMembership
from app.models.project import Project
from app.models.transcript import Transcript, TranscriptSegment, TranscriptToken, TranscriptType
from app.models.user import User
from app.models.video import Video
from app.reranking import factory as reranking_factory
from app.services.chat_retrieval import ANN_MAX_COSINE_DISTANCE, RERANK_TOP_K, search_chunks
from sqlalchemy import func
from sqlalchemy.orm import Session


def _unit_vector(index: int) -> list[float]:
    vector = [0.0] * EMBEDDING_DIMENSION
    vector[index] = 1.0
    return vector


def _project(db: Session, user: User) -> Project:
    project = Project(name="P", created_by=user.id, updated_by=user.id)
    db.add(project)
    db.flush()
    db.add(ProjectMembership(project_id=project.id, user_id=user.id, role=MembershipRole.OWNER))
    return project


def _folder(db: Session, project: Project, user: User, name: str = "F") -> Folder:
    folder = Folder(project_id=project.id, name=name, created_by=user.id, updated_by=user.id)
    db.add(folder)
    db.flush()
    return folder


def _video(
    db: Session, project: Project, user: User, folder: Folder | None = None, name: str = "clip"
) -> Video:
    if folder is None:
        folder = _folder(db, project, user)
    video = Video(
        folder_id=folder.id,
        project_id=project.id,
        name=name,
        original_filename=f"{name}.mp4",
        created_by=user.id,
        updated_by=user.id,
    )
    db.add(video)
    db.flush()
    return video


def _transcript(
    db: Session, video: Video, user: User, *, type_: TranscriptType, language: str
) -> Transcript:
    transcript = Transcript(
        video_id=video.id,
        project_id=video.project_id,
        language=language,
        type=type_,
        created_by=user.id,
    )
    db.add(transcript)
    db.flush()
    return transcript


def _chunk(
    db: Session,
    transcript: Transcript,
    video: Video,
    *,
    text: str,
    embedding: list[float],
    start_time: float,
    end_time: float,
    speaker_name: str | None = None,
) -> TranscriptChunk:
    # Each chunk gets its own segment/token pair — content doesn't matter for
    # retrieval, only the chunk row's own fields do.
    segment = TranscriptSegment(transcript_id=transcript.id, position=Decimal(1))
    db.add(segment)
    db.flush()
    token = TranscriptToken(
        transcript_id=transcript.id,
        segment_id=segment.id,
        project_id=video.project_id,
        original_text=text,
        start_time=start_time,
        end_time=end_time,
        position=Decimal(1),
        created_by=video.created_by,
        updated_by=video.created_by,
    )
    db.add(token)
    db.flush()
    chunk = TranscriptChunk(
        transcript_id=transcript.id,
        video_id=video.id,
        project_id=video.project_id,
        language=transcript.language,
        segment_id=segment.id,
        start_token_id=token.id,
        end_token_id=token.id,
        start_time=start_time,
        end_time=end_time,
        speaker_name=speaker_name,
        chunk_index=0,
        text=text,
        search_vector=func.to_tsvector("simple", text),
        embedding=embedding,
        embedding_model="test-model",
    )
    db.add(chunk)
    db.flush()
    return chunk


class _FakeEmbeddingsProvider:
    def __init__(self, vector: list[float]) -> None:
        self._vector = vector

    def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._vector for _ in texts]


class _FakeRerankProvider:
    def __init__(self, scores_by_text: dict[str, float], *, default: float = 0.0) -> None:
        self._scores = scores_by_text
        self._default = default
        self.calls: list[tuple[str, list[str]]] = []

    def rerank(self, query: str, documents: list[str]) -> list[float]:
        self.calls.append((query, list(documents)))
        return [self._scores.get(doc, self._default) for doc in documents]


def _install_providers(
    monkeypatch: pytest.MonkeyPatch,
    *,
    query_vector: list[float],
    scores_by_text: dict[str, float],
    default_score: float = 0.0,
) -> _FakeRerankProvider:
    monkeypatch.setattr(
        embeddings_factory, "get_embeddings_provider", lambda: _FakeEmbeddingsProvider(query_vector)
    )
    fake_rerank = _FakeRerankProvider(scores_by_text, default=default_score)
    monkeypatch.setattr(reranking_factory, "get_rerank_provider", lambda: fake_rerank)
    return fake_rerank


def test_search_chunks_unions_ann_and_fts_candidates_without_duplicates(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(db_session, user)
    video = _video(db_session, project, user)
    transcript = _transcript(db_session, video, user, type_=TranscriptType.ORIGINAL, language="en")
    # Semantically close to the query vector but no lexical overlap.
    ann_only = _chunk(
        db_session,
        transcript,
        video,
        text="zzz unrelated words zzz",
        embedding=_unit_vector(0),
        start_time=0.0,
        end_time=1.0,
    )
    # Lexically matches the query but embedded far away (distance 1, past the
    # ANN cutoff, so it can only be found by the FTS leg).
    fts_only = _chunk(
        db_session,
        transcript,
        video,
        text="castle on the hill",
        embedding=_unit_vector(1),
        start_time=2.0,
        end_time=3.0,
    )
    fake_rerank = _install_providers(
        monkeypatch,
        query_vector=_unit_vector(0),
        scores_by_text={ann_only.text: 0.9, fts_only.text: 0.5},
    )

    results = search_chunks(db_session, project.id, fts_query="castle", semantic_query="castle")

    assert [match.chunk.id for match in results] == [ann_only.id, fts_only.id]
    assert results[0].matched_via == frozenset({"semantic"})
    assert results[1].matched_via == frozenset({"fts"})
    # The union was deduped before reranking: each candidate appears once.
    ((_query, documents),) = fake_rerank.calls
    assert sorted(documents) == sorted([ann_only.text, fts_only.text])


def test_search_chunks_matched_via_both_legs(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(db_session, user)
    video = _video(db_session, project, user)
    transcript = _transcript(db_session, video, user, type_=TranscriptType.ORIGINAL, language="en")
    chunk = _chunk(
        db_session,
        transcript,
        video,
        text="castle on the hill",
        embedding=_unit_vector(0),
        start_time=0.0,
        end_time=1.0,
    )
    _install_providers(monkeypatch, query_vector=_unit_vector(0), scores_by_text={chunk.text: 1.0})

    results = search_chunks(db_session, project.id, fts_query="castle", semantic_query="castle")

    assert len(results) == 1
    assert results[0].matched_via == frozenset({"semantic", "fts"})


def test_search_chunks_scopes_to_project(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project_a = _project(db_session, user)
    project_b = _project(db_session, user)
    video_a = _video(db_session, project_a, user)
    transcript_a = _transcript(
        db_session, video_a, user, type_=TranscriptType.ORIGINAL, language="en"
    )
    _chunk(
        db_session,
        transcript_a,
        video_a,
        text="castle on the hill",
        embedding=_unit_vector(0),
        start_time=0.0,
        end_time=1.0,
    )
    fake_rerank = _install_providers(monkeypatch, query_vector=_unit_vector(0), scores_by_text={})

    results = search_chunks(db_session, project_b.id, fts_query="castle", semantic_query="castle")

    assert results == []
    assert fake_rerank.calls == []  # empty candidate set short-circuits before reranking


def test_search_chunks_truncates_to_top_k(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(db_session, user)
    video = _video(db_session, project, user)
    transcript = _transcript(db_session, video, user, type_=TranscriptType.ORIGINAL, language="en")
    chunks = [
        _chunk(
            db_session,
            transcript,
            video,
            text=f"castle number {i}",
            embedding=_unit_vector(0),
            start_time=float(i),
            end_time=float(i) + 0.5,
        )
        for i in range(RERANK_TOP_K + 3)
    ]
    # Highest score to the first chunk, descending — a deterministic ranking.
    scores = {chunk.text: float(len(chunks) - i) for i, chunk in enumerate(chunks)}
    _install_providers(monkeypatch, query_vector=_unit_vector(0), scores_by_text=scores)

    results = search_chunks(db_session, project.id, fts_query="castle", semantic_query="castle")

    assert len(results) == RERANK_TOP_K
    assert [match.chunk.id for match in results] == [chunk.id for chunk in chunks[:RERANK_TOP_K]]


def test_search_chunks_resolves_translation_hit_to_original(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(db_session, user)
    video = _video(db_session, project, user)
    original_transcript = _transcript(
        db_session, video, user, type_=TranscriptType.ORIGINAL, language="es"
    )
    translation_transcript = _transcript(
        db_session, video, user, type_=TranscriptType.TRANSLATION, language="en"
    )
    original_chunk = _chunk(
        db_session,
        original_transcript,
        video,
        text="hola mundo",
        embedding=_unit_vector(0),
        start_time=10.0,
        end_time=12.0,
    )
    translation_chunk = _chunk(
        db_session,
        translation_transcript,
        video,
        text="hello world",
        embedding=_unit_vector(0),
        start_time=10.1,  # overlaps the original chunk's [10.0, 12.0] range
        end_time=11.9,
    )
    _install_providers(
        monkeypatch,
        query_vector=_unit_vector(0),
        scores_by_text={translation_chunk.text: 1.0, original_chunk.text: 0.1},
    )

    results = search_chunks(db_session, project.id, fts_query="hello", semantic_query="hello")

    # The translation chunk scored highest, but citations always resolve to
    # the original-language chunk covering the same moment.
    assert [match.chunk.id for match in results] == [original_chunk.id]


def test_search_chunks_dedups_after_resolving_to_original(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(db_session, user)
    video = _video(db_session, project, user)
    original_transcript = _transcript(
        db_session, video, user, type_=TranscriptType.ORIGINAL, language="es"
    )
    translation_en = _transcript(
        db_session, video, user, type_=TranscriptType.TRANSLATION, language="en"
    )
    translation_fr = _transcript(
        db_session, video, user, type_=TranscriptType.TRANSLATION, language="fr"
    )
    original_chunk = _chunk(
        db_session,
        original_transcript,
        video,
        text="hola mundo",
        embedding=_unit_vector(0),
        start_time=10.0,
        end_time=12.0,
    )
    # Found via semantic search only.
    chunk_en = _chunk(
        db_session,
        translation_en,
        video,
        text="hello world",
        embedding=_unit_vector(0),
        start_time=10.1,
        end_time=11.9,
    )
    # Found via both legs — its matched_via should survive into the union.
    chunk_fr = _chunk(
        db_session,
        translation_fr,
        video,
        text="bonjour monde",
        embedding=_unit_vector(0),
        start_time=10.2,
        end_time=11.8,
    )
    _install_providers(
        monkeypatch,
        query_vector=_unit_vector(0),
        scores_by_text={chunk_en.text: 0.9, chunk_fr.text: 1.0, original_chunk.text: 0.1},
    )

    results = search_chunks(db_session, project.id, fts_query="bonjour", semantic_query="hello")

    # Both translation hits resolve to the same original chunk; it appears
    # once, keeping the max score of the two collapsed winners and the union
    # of how each was found (chunk_fr matched both legs, chunk_en semantic-only).
    assert [match.chunk.id for match in results] == [original_chunk.id]
    assert results[0].score == 1.0
    assert results[0].matched_via == frozenset({"semantic", "fts"})


def test_search_chunks_keeps_translation_chunk_without_overlapping_original(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(db_session, user)
    video = _video(db_session, project, user)
    translation_transcript = _transcript(
        db_session, video, user, type_=TranscriptType.TRANSLATION, language="en"
    )
    # No original transcript/chunk exists for this video at all.
    translation_chunk = _chunk(
        db_session,
        translation_transcript,
        video,
        text="hello world",
        embedding=_unit_vector(0),
        start_time=10.0,
        end_time=12.0,
    )
    _install_providers(
        monkeypatch, query_vector=_unit_vector(0), scores_by_text={translation_chunk.text: 1.0}
    )

    results = search_chunks(db_session, project.id, fts_query="hello", semantic_query="hello")

    assert [match.chunk.id for match in results] == [translation_chunk.id]


def test_search_chunks_only_fts_query_never_calls_embeddings_provider(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(db_session, user)
    video = _video(db_session, project, user)
    transcript = _transcript(db_session, video, user, type_=TranscriptType.ORIGINAL, language="en")
    chunk = _chunk(
        db_session,
        transcript,
        video,
        text="castle on the hill",
        embedding=_unit_vector(0),
        start_time=0.0,
        end_time=1.0,
    )

    def boom() -> EmbeddingsProvider:
        raise AssertionError("embeddings provider must not be built for an fts-only search")

    monkeypatch.setattr(embeddings_factory, "get_embeddings_provider", boom)
    fake_rerank = _FakeRerankProvider({chunk.text: 1.0})
    monkeypatch.setattr(reranking_factory, "get_rerank_provider", lambda: fake_rerank)

    results = search_chunks(db_session, project.id, fts_query="castle")

    assert [match.chunk.id for match in results] == [chunk.id]
    assert results[0].matched_via == frozenset({"fts"})
    ((rerank_query, _documents),) = fake_rerank.calls
    assert rerank_query == "castle"


def test_search_chunks_only_semantic_query_never_runs_fts_leg(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(db_session, user)
    video = _video(db_session, project, user)
    transcript = _transcript(db_session, video, user, type_=TranscriptType.ORIGINAL, language="en")
    # Text lexically matches "castle" and the embedding is close to the query
    # vector — if the FTS leg ran despite no fts_query, matched_via would
    # pick up "fts" too.
    chunk = _chunk(
        db_session,
        transcript,
        video,
        text="castle on the hill",
        embedding=_unit_vector(0),
        start_time=0.0,
        end_time=1.0,
    )
    _install_providers(monkeypatch, query_vector=_unit_vector(0), scores_by_text={chunk.text: 1.0})

    results = search_chunks(db_session, project.id, semantic_query="castle")

    assert [match.chunk.id for match in results] == [chunk.id]
    assert results[0].matched_via == frozenset({"semantic"})


def test_search_chunks_neither_query_raises_value_error(db_session: Session, user: User) -> None:
    project = _project(db_session, user)

    with pytest.raises(ValueError):
        search_chunks(db_session, project.id)


def test_search_chunks_speaker_name_filters_out_other_speakers(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(db_session, user)
    video = _video(db_session, project, user)
    transcript = _transcript(db_session, video, user, type_=TranscriptType.ORIGINAL, language="en")
    alice_chunk = _chunk(
        db_session,
        transcript,
        video,
        text="alice talking",
        embedding=_unit_vector(0),
        start_time=0.0,
        end_time=1.0,
        speaker_name="Alice",
    )
    _chunk(
        db_session,
        transcript,
        video,
        text="bob talking",
        embedding=_unit_vector(0),
        start_time=2.0,
        end_time=3.0,
        speaker_name="Bob",
    )
    _install_providers(
        monkeypatch,
        query_vector=_unit_vector(0),
        scores_by_text={"alice talking": 1.0, "bob talking": 1.0},
    )

    results = search_chunks(db_session, project.id, semantic_query="talking", speaker_name="Alice")

    assert [match.chunk.id for match in results] == [alice_chunk.id]


def test_search_chunks_video_id_scopes_to_one_video(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(db_session, user)
    folder = _folder(db_session, project, user)
    video_a = _video(db_session, project, user, folder=folder, name="a")
    video_b = _video(db_session, project, user, folder=folder, name="b")
    transcript_a = _transcript(
        db_session, video_a, user, type_=TranscriptType.ORIGINAL, language="en"
    )
    transcript_b = _transcript(
        db_session, video_b, user, type_=TranscriptType.ORIGINAL, language="en"
    )
    chunk_a = _chunk(
        db_session,
        transcript_a,
        video_a,
        text="in video a",
        embedding=_unit_vector(0),
        start_time=0.0,
        end_time=1.0,
    )
    _chunk(
        db_session,
        transcript_b,
        video_b,
        text="in video b",
        embedding=_unit_vector(0),
        start_time=0.0,
        end_time=1.0,
    )
    _install_providers(
        monkeypatch,
        query_vector=_unit_vector(0),
        scores_by_text={"in video a": 1.0, "in video b": 1.0},
    )

    results = search_chunks(db_session, project.id, semantic_query="video", video_id=video_a.id)

    assert [match.chunk.id for match in results] == [chunk_a.id]


def test_search_chunks_folder_id_resolves_nested_subfolder(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(db_session, user)
    root = _folder(db_session, project, user, "Root")
    child = Folder(
        project_id=project.id,
        parent_folder_id=root.id,
        name="Child",
        created_by=user.id,
        updated_by=user.id,
    )
    db_session.add(child)
    db_session.flush()
    other_folder = _folder(db_session, project, user, "Other")
    video_in_child = _video(db_session, project, user, folder=child, name="in-child")
    video_elsewhere = _video(db_session, project, user, folder=other_folder, name="elsewhere")
    transcript_in_child = _transcript(
        db_session, video_in_child, user, type_=TranscriptType.ORIGINAL, language="en"
    )
    transcript_elsewhere = _transcript(
        db_session, video_elsewhere, user, type_=TranscriptType.ORIGINAL, language="en"
    )
    chunk_in_child = _chunk(
        db_session,
        transcript_in_child,
        video_in_child,
        text="nested content",
        embedding=_unit_vector(0),
        start_time=0.0,
        end_time=1.0,
    )
    _chunk(
        db_session,
        transcript_elsewhere,
        video_elsewhere,
        text="other content",
        embedding=_unit_vector(0),
        start_time=0.0,
        end_time=1.0,
    )
    _install_providers(
        monkeypatch,
        query_vector=_unit_vector(0),
        scores_by_text={"nested content": 1.0, "other content": 1.0},
    )

    results = search_chunks(db_session, project.id, semantic_query="content", folder_id=root.id)

    assert [match.chunk.id for match in results] == [chunk_in_child.id]


def test_search_chunks_video_id_wins_over_folder_id(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(db_session, user)
    folder = _folder(db_session, project, user)
    video_a = _video(db_session, project, user, folder=folder, name="a")
    video_b = _video(db_session, project, user, folder=folder, name="b")
    transcript_a = _transcript(
        db_session, video_a, user, type_=TranscriptType.ORIGINAL, language="en"
    )
    transcript_b = _transcript(
        db_session, video_b, user, type_=TranscriptType.ORIGINAL, language="en"
    )
    chunk_a = _chunk(
        db_session,
        transcript_a,
        video_a,
        text="in video a",
        embedding=_unit_vector(0),
        start_time=0.0,
        end_time=1.0,
    )
    _chunk(
        db_session,
        transcript_b,
        video_b,
        text="in video b",
        embedding=_unit_vector(0),
        start_time=0.0,
        end_time=1.0,
    )
    _install_providers(
        monkeypatch,
        query_vector=_unit_vector(0),
        scores_by_text={"in video a": 1.0, "in video b": 1.0},
    )

    results = search_chunks(
        db_session, project.id, semantic_query="video", video_id=video_a.id, folder_id=folder.id
    )

    assert [match.chunk.id for match in results] == [chunk_a.id]


def test_search_chunks_folder_id_with_no_videos_short_circuits_to_empty(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(db_session, user)
    empty_folder = _folder(db_session, project, user, "Empty")
    fake_rerank = _install_providers(monkeypatch, query_vector=_unit_vector(0), scores_by_text={})

    results = search_chunks(
        db_session, project.id, semantic_query="anything", folder_id=empty_folder.id
    )

    assert results == []
    assert fake_rerank.calls == []


def test_search_chunks_ann_leg_excludes_far_embedding(
    db_session: Session, user: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    project = _project(db_session, user)
    video = _video(db_session, project, user)
    transcript = _transcript(db_session, video, user, type_=TranscriptType.ORIGINAL, language="en")
    # Orthogonal to the query vector -> cosine distance 1.0, past
    # ANN_MAX_COSINE_DISTANCE, and no lexical overlap either.
    far_chunk = _chunk(
        db_session,
        transcript,
        video,
        text="completely different topic",
        embedding=_unit_vector(1),
        start_time=0.0,
        end_time=1.0,
    )
    assert ANN_MAX_COSINE_DISTANCE < 1.0
    fake_rerank = _install_providers(
        monkeypatch, query_vector=_unit_vector(0), scores_by_text={far_chunk.text: 1.0}
    )

    results = search_chunks(db_session, project.id, semantic_query="topic")

    assert results == []
    assert fake_rerank.calls == []
