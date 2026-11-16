#!/bin/sh
# Probe every station in stations.js the way the browser would: cross-origin
# request from the site with a small Range, following redirects.
# Prints: id status content-type acao verdict.
# A row is OK only when the final response is 2xx (ICY 200 counts as 200),
# its content-type is audio/* (or application/ogg) and its
# Access-Control-Allow-Origin is "*" or the site origin.
# Exits non-zero if any row fails or the station list is empty.
ORIGIN="https://www.hantunzaw.dev"
cd "$(dirname "$0")/.." || exit 2
out=$(mktemp "${TMPDIR:-/tmp}/check-stations.XXXXXX") || exit 2
trap 'rm -f "$out"' EXIT
rows=$(node -e 'import("./stations.js").then(m=>{for(const s of m.STATIONS)console.log(s.id+"\t"+s.url)})') || exit 2
if [ -z "$rows" ]; then echo "no stations found in stations.js" >&2; exit 2; fi
printf '%s\n' "$rows" | while IFS="$(printf '\t')" read -r id url; do
  hdr=$(curl -sL -m 8 -H "Origin: $ORIGIN" -H "Range: bytes=0-1000" -D - -o /dev/null "$url" 2>/dev/null </dev/null | tr -d '\r')
  # last response block only (after redirects)
  last=$(printf '%s\n' "$hdr" | awk 'BEGIN{RS="";ORS="\n\n"} {b=$0} END{print b}')
  status=$(printf '%s\n' "$last" | awk 'toupper($1) ~ /^(HTTP|ICY)/ {print $2; exit}')
  ctype=$(printf '%s\n' "$last" | sed -n 's/^[Cc]ontent-[Tt]ype: *//p' | head -n1 | tr 'A-Z' 'a-z')
  acao=$(printf '%s\n' "$last" | sed -n 's/^[Aa]ccess-[Cc]ontrol-[Aa]llow-[Oo]rigin: *//p' | head -n1)
  ok=OK
  case "$status" in 2??) ;; *) ok=FAIL ;; esac
  case "$ctype" in audio/*|application/ogg*) ;; *) ok=FAIL ;; esac
  case "$acao" in '*'|"$ORIGIN") ;; *) ok=FAIL ;; esac
  printf '%-24s %-4s %-26s %-34s %s\n' "$id" "${status:--}" "${ctype:--}" "${acao:--}" "$ok"
done > "$out"
cat "$out"
[ -s "$out" ] || { echo "no rows probed" >&2; exit 2; }
! grep -q ' FAIL$' "$out"
