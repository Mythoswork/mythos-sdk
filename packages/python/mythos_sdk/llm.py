from typing import TypeVar

from openai import AsyncOpenAI

from .config import load_config
from .billing_metadata import get_llm_billing_metadata, MythosLlmBillingMetadata
from .errors import MythosError
from .types import MythosSession

Fallback = TypeVar("Fallback")

__all__ = ["llm", "get_llm_billing_metadata", "MythosLlmBillingMetadata"]


def llm(
    session: MythosSession | None,
    api_key: str | None = None,
    fallback: Fallback | None = None,
    base_url: str | None = None,
    timeout: float = 600.0,
) -> AsyncOpenAI | Fallback:
    if session is None:
        if fallback is not None:
            return fallback
        raise MythosError("An active Mythos session is required for LLM access", "LLM_SESSION_REQUIRED")
    # A session decoded before this release, or verified against an older backend, can be
    # real and active but still lack an identity token -- that's the same "can't reach
    # Mythos's LLM gateway" situation as no session at all, so it falls back the same way
    # rather than hard-throwing regardless of whether the caller configured one.
    if not session.llmIdentityToken:
        if fallback is not None:
            return fallback
        raise MythosError("The Mythos session is missing its LLM identity token", "LLM_IDENTITY_REQUIRED")

    resolved_base_url = base_url if base_url is not None else f"{load_config().api_url.rstrip('/')}/v1"
    try:
        return AsyncOpenAI(
            api_key=api_key,
            base_url=resolved_base_url,
            default_headers={"X-Mythos-Identity": f"Bearer {session.llmIdentityToken}"},
            timeout=timeout,
        )
    except Exception as err:
        # Most commonly: no api_key given and no OPENAI_API_KEY env var set, which the
        # underlying openai client rejects with its own error type -- surfaced as a
        # MythosError instead, consistent with every other failure mode of this function.
        raise MythosError(
            f"Failed to construct the Mythos LLM client: {err}", "LLM_CLIENT_CONSTRUCTION_ERROR"
        ) from err
