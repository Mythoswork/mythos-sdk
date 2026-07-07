from mythos_sdk.version import SDK_VERSION, get_sdk_version


def test_sdk_version_matches_package_metadata():
    assert get_sdk_version() == SDK_VERSION
    assert SDK_VERSION == "0.1.0"
