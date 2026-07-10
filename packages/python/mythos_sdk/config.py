import os
from dataclasses import dataclass

DEFAULT_API_URL = "https://api.mythos.work"


@dataclass
class MythosConfig:
    listing_ids: list[str]
    api_url: str


def load_config() -> MythosConfig:
    api_url = os.environ.get("MYTHOS_API_URL", DEFAULT_API_URL)
    multi = os.environ.get("MYTHOS_LISTING_IDS")
    single = os.environ.get("MYTHOS_LISTING_ID")

    if multi:
        listing_ids = [lid.strip() for lid in multi.split(",") if lid.strip()]
    elif single:
        listing_ids = [single]
    else:
        listing_ids = []

    return MythosConfig(listing_ids=listing_ids, api_url=api_url)
