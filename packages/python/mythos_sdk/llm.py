from collections.abc import Mapping
from typing import TypeVar, TypedDict

from openai import AsyncOpenAI

from .config import load_config
from .errors import MythosError
from .types import MythosSession

Fallback = TypeVar("Fallback")
_MISSING = object()


class _MythosLlmBillingMetadataRequired(TypedDict):
    mythos_cost_microunits: str | None
    mythos_pricing_source: str


class MythosLlmBillingMetadata(_MythosLlmBillingMetadataRequired, total=False):
    mythos_billing_status: str
    mythos_provider_cost_credits: int
    mythos_creator_margin_credits: int
    mythos_platform_fee_credits: int
    mythos_charge_credits: int
    mythos_creator_earning_credits: int


def _response_value(response: object, key: str) -> object:
    if isinstance(response, Mapping):
        return response.get(key, _MISSING)

    value = getattr(response, key, _MISSING)
    if value is not _MISSING:
        return value

    extras = getattr(response, "model_extra", None)
    if isinstance(extras, Mapping):
        return extras.get(key, _MISSING)
    return _MISSING


def get_llm_billing_metadata(response: object) -> MythosLlmBillingMetadata | None:
    cost = _response_value(response, "mythos_cost_microunits")
    pricing_source = _response_value(response, "mythos_pricing_source")
    if cost is _MISSING or pricing_source is _MISSING:
        return None
    if (cost is not None and not isinstance(cost, str)) or not isinstance(pricing_source, str):
        return None

    return {
        "mythos_cost_microunits": cost,
        "mythos_pricing_source": pricing_source,
        **{
            key: value
            for key in (
                "mythos_billing_status",
                "mythos_provider_cost_credits",
                "mythos_creator_margin_credits",
                "mythos_platform_fee_credits",
                "mythos_charge_credits",
                "mythos_creator_earning_credits",
            )
            if (value := _response_value(response, key)) is not _MISSING
            and (isinstance(value, str) if key == "mythos_billing_status" else isinstance(value, int) and not isinstance(value, bool) and value >= 0)
        },
    }


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
