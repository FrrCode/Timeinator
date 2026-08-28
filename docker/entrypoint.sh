#!/bin/sh
set -e

# `/data` is a bind mount, so its ownership comes from the host and cannot be
# settled at build time. Worse, it differs by daemon: under a rootful daemon the
# host's uid 1000 is the container's uid 1000 and everything lines up, while
# under a rootless one the host user maps to container-root and the directory
# arrives owned by 0:0 — unwritable by the unprivileged user the app runs as.
#
# Taking the directory here, in the one moment we are still root, makes the two
# behave the same, so what is tested locally is what runs on the server. The
# process then drops to `node` for good; nothing after this line runs as root.
if [ "$(id -u)" = "0" ]; then
	chown node:node "${DATA_DIR:-/data}"
	exec su-exec node "$@"
fi

exec "$@"
