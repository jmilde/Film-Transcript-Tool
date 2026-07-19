from fastapi.testclient import TestClient

ALLOWED_ORIGIN = "http://localhost:5173"


def test_cors_preflight_allows_configured_origin(client: TestClient) -> None:
    response = client.options(
        "/projects",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_ORIGIN


def test_cors_simple_request_carries_allow_origin(client: TestClient) -> None:
    # Even an unauthenticated request echoes the CORS header for an allowed origin,
    # so the browser lets the frontend read the response.
    response = client.get("/health", headers={"Origin": ALLOWED_ORIGIN})

    assert response.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN


def test_cors_rejects_unknown_origin(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": "https://evil.example"})

    assert "access-control-allow-origin" not in response.headers
