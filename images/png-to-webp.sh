#!/bin/bash

magick "$1" -define webp:lossless=true "${1%.*}.webp"
