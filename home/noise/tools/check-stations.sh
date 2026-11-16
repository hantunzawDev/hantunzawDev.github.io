#!/bin/sh
# Probe every station in stations.js the way the browser would: cross-origin
# request from the site with a small Range. Prints: id status content-type acao.
# Exits non-zero if any row is not an audio/* (or application/ogg) response.
cd "$(dirname "$0")/.." || exit 2
out=$(mktemp "${TMPDIR:-/tmp}/check-stations.XXXXXX") || exit 2
trap 'rm -f "$out"' EXIT
rows=$(node -e 'import("./stations.js").then(m=>{for(const s of m.STATIONS)console.log(s.id+"\t"+s.url)})') || exit 2
printf '%s\n' "$rows" | while IFS="$(printf '\t')" read -r id url; do
  hdr=$(curl -sL -m 8 -H "Origin: https://www.hantunzaw.dev" -H "Range: bytes=0-1000" -D - -o /dev/null "$url" 2>/dev/null </dev/null | tr -d '\r')
  # last response block only (after redirects)
  last=$(printf '%s\n' "$hdr" | awk 'BEGIN{RS="";ORS="\n\n"} {b=$0} END{print b}')
  status=$(printf '%s\n' "$last" | awk 'toupper($1) ~ /^HTTP/ {print $2; exit}')
  ctype=$(printf '%s\n' "$last" | sed -n 's/^[Cc]ontent-[Tt]ype: *//p' | head -n1 | tr 'A-Z' 'a-z')
  acao=$(printf '%s\n' "$last" | sed -n 's/^[Aa]ccess-[Cc]ontrol-[Aa]llow-[Oo]rigin: *//p' | head -n1)
  case "$ctype" in
    audio/*|application/ogg*) ok=OK ;;
    *) ok=FAIL ;;
  esac
  printf '%-24s %-4s %-26s %-34s %s\n' "$id" "${status:--}" "${ctype:--}" "${acao:--}" "$ok"
done > "$out"
cat "$out"
! grep -q ' FAIL$' "$out"
