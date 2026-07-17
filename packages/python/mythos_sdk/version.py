from importlib.metadata import PackageNotFoundError, version


def get_sdk_version() -> str:
    try:
        return version("mythos-sdk")
    except PackageNotFoundError:
        return "0.1.0"


SDK_VERSION = get_sdk_version()
