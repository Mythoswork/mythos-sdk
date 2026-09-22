from unittest.mock import patch

import httpx
import pytest
from openai import AsyncOpenAI
from openai.types.chat import ChatCompletion

from mythos_sdk import MythosError, MythosSession
from mythos_sdk.llm import get_llm_billing_metadata, llm


SESSION = MythosSession(
    userId="user-1",
    email="user@example.com",
    displayName="User",
    listingId="listing-abc",
    sessionJti="jti-001",
    llmIdentityToken="identity-token",
)


def test_returns_fallback_unchanged_without_a_session():
    fallback = {"answer": "fallback"}

    assert llm(None, fallback=fallback) is fallback


def test_raises_typed_error_without_a_session_or_fallback():
    with pytest.raises(MythosError) as exc_info:
        llm(None)

    assert exc_info.value.code == "LLM_SESSION_REQUIRED"


async def test_configures_official_client_with_provider_auth_and_mythos_identity():
    client = llm(SESSION, api_key="provider-key", timeout=12.5)
    assert isinstance(client, AsyncOpenAI)
    assert str(client.base_url) == "https://api.mythos.work/v1/"
    assert client.api_key == "provider-key"
    assert client.timeout == 12.5

    requests: list[httpx.Request] = []

    async def send(_client: httpx.AsyncClient, request: httpx.Request, **_kwargs: object) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            request=request,
            json={
                "id": "chatcmpl-test",
                "object": "chat.completion",
                "created": 1,
                "model": "test-model",
                "choices": [],
            },
        )

    try:
        with patch.object(httpx.AsyncClient, "send", new=send):
            await client.chat.completions.create(model="test-model", messages=[])
    finally:
        await client.close()

    request = requests[0]
    assert str(request.url) == "https://api.mythos.work/v1/chat/completions"
    assert request.headers["authorization"] == "Bearer provider-key"
    assert request.headers["x-mythos-identity"] == "Bearer identity-token"


def test_reads_backend_billing_metadata_from_a_completion():
    response = ChatCompletion(
        id="chatcmpl-test",
        object="chat.completion",
        created=1,
        model="test-model",
        choices=[],
        mythos_cost_microunits="1234",
        mythos_pricing_source="rate_card",
        mythos_billing_status="settled",
        mythos_provider_cost_credits=1,
        mythos_creator_margin_credits=1,
        mythos_platform_fee_credits=1,
        mythos_charge_credits=3,
        mythos_creator_earning_credits=0,
    )

    assert get_llm_billing_metadata(response) == {
        "mythos_cost_microunits": "1234",
        "mythos_pricing_source": "rate_card",
        "mythos_billing_status": "settled",
        "mythos_provider_cost_credits": 1,
        "mythos_creator_margin_credits": 1,
        "mythos_platform_fee_credits": 1,
        "mythos_charge_credits": 3,
        "mythos_creator_earning_credits": 0,
    }
    assert get_llm_billing_metadata({"id": "without-metadata"}) is None
