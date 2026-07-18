#!/bin/sh
set -eu

APPDIR=/opt/hypersomnia-headless
APPIMAGE="${APPDIR}/AppRun"
HOME=/home/hypersomniac
XDG_CONFIG_HOME="${HOME}/.config"

export APPDIR APPIMAGE HOME XDG_CONFIG_HOME

test -x "${APPDIR}/AppRun"
test -d "${XDG_CONFIG_HOME}/Hypersomnia"

cd "${HOME}"

# The APP image's Node gateway command is intentionally ignored for this service.
exec "${APPDIR}/AppRun"
