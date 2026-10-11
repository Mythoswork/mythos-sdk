import re

PRODUCER_KEY_PATTERN = re.compile(r"^mk_[A-Za-z0-9_-]{32}$")
MALFORMED_PRODUCER_KEY_MESSAGE = "MYTHOS_KEY is malformed. Copy it again from the Mythos dashboard."
PRODUCER_MISMATCH_MESSAGE = "This app is bound to a different Mythos Producer. Check MYTHOS_KEY."
MISSING_PRODUCER_KEY_WARNING = "MYTHOS_KEY is not set: this app accepts Listings auto-registered by any Mythos Producer. Copy your key from the Mythos dashboard into MYTHOS_KEY. It will be required in 0.6.0."
