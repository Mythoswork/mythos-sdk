from importlib.metadata import PackageNotFoundError, version

MYTHOS_HTTP_TIMEOUT = 5.0


def get_sdk_version() -> str:
    try:
        return version("mythos-sdk")
    except PackageNotFoundError:
        return "0.1.0"


SDK_VERSION = get_sdk_version()
