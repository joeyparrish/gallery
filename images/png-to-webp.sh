#!/bin/bash

set -e
set -x

magick "$1" -define webp:lossless=true "${1%.*}.webp"
rm -f "$1"
