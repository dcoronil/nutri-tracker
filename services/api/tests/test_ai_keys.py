def test_ai_key_status_save_test_delete_flow(client, auth_headers, monkeypatch):
    status_before = client.get("/user/ai-key/status", headers=auth_headers)
    assert status_before.status_code == 200
    assert status_before.json()["configured"] is False

    save_response = client.post(
        "/user/ai-key",
        json={"provider": "openai", "api_key": "sk-test-key-1234567890abcd"},
        headers=auth_headers,
    )
    assert save_response.status_code == 200
    save_body = save_response.json()
    assert save_body["configured"] is True
    assert save_body["provider"] == "openai"
    assert save_body["key_hint"] is not None
    assert "sk-test" not in (save_body["key_hint"] or "")

    async def _mock_test(provider: str, api_key: str):
        assert provider == "openai"
        if api_key == "sk-test-key-1234567890abcd":
            return True, "OpenAI API key is valid"
        return False, "Invalid API key or insufficient permissions"

    monkeypatch.setattr("app.api.routes.test_provider_api_key", _mock_test)

    test_saved = client.post("/user/ai-key/test", json={}, headers=auth_headers)
    assert test_saved.status_code == 200
    assert test_saved.json()["ok"] is True

    test_inline = client.post(
        "/user/ai-key/test",
        json={"provider": "openai", "api_key": "sk-inline-key-1234567890abcd"},
        headers=auth_headers,
    )
    assert test_inline.status_code == 400

    delete_response = client.delete("/user/ai-key", headers=auth_headers)
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True

    status_after = client.get("/user/ai-key/status", headers=auth_headers)
    assert status_after.status_code == 200
    assert status_after.json()["configured"] is False


def test_ai_key_not_exposed_in_me_response(client, auth_headers):
    save_response = client.post(
        "/user/ai-key",
        json={"provider": "openai", "api_key": "sk-test-key-1234567890abcd"},
        headers=auth_headers,
    )
    assert save_response.status_code == 200

    me = client.get("/me", headers=auth_headers)
    assert me.status_code == 200
    payload = me.json()
    payload_str = str(payload)
    assert "ai_api_key" not in payload_str
    assert "encrypted" not in payload_str
