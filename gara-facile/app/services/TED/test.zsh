#!/usr/bin/env zsh
set -euo pipefail

script_dir=${0:A:h}
env_file="$script_dir/../../../.env"

if [[ -f "$env_file" ]]; then
  set -a
  source "$env_file"
  set +a
fi

: "${EU_API_KEY:?EU_API_KEY is not set. Add it to gara-facile/.env}"

if command -v jq >/dev/null 2>&1; then
  pretty=(jq .)
elif command -v python3 >/dev/null 2>&1; then
  pretty=(python3 -m json.tool)
else
  pretty=(cat)
fi

body='{
  "query": "place-of-performance IN (ESP) AND notice-type NOT IN (veat can-standard can-social can-modif compl can-tran) SORT BY ojs-number DESC",
  "fields": [
    "classification-cpv",
    "contract-title",
    "title-lot",
    "notice-title",
    "description-proc",
    "description-lot",
    "contract-nature",
    "estimated-value-proc",
    "estimated-value-lot",
    "estimated-value-cur-proc",
    "estimated-value-cur-lot",
    "deadline-receipt-tender-date-lot",
    "contract-duration-start-date-lot",
    "contract-duration-end-date-lot",
    "duration-period-value-lot",
    "duration-period-unit-lot",
    "renewal-description-lot",
    "place-of-performance-country-proc",
    "place-of-performance-country-lot",
    "place-of-performance-city-proc",
    "place-of-performance-city-lot",
    "sme-lot",
    "subcontracting-allowed-lot",
    "award-criterion-description-lot",
    "notice-type",
    "buyer-name",
    "organisation-name-buyer",
    "document-url-lot",
    "submission-url-lot",
    "submission-nonelectronic-lot",
    "submission-nonelectronic-description-lot",
    "electronic-submission-lot",
    "submission-language",
    "touchpoint-email-tender-receip-lot",
    "touchpoint-email-buyer",
    "buyer-profile",
    "touchpoint-internet-address-buyer"
  ],
  "limit": 20,
  "page": 1,
  "scope": "ACTIVE"
}'

curl --fail-with-body --silent --show-error \
  --request POST 'https://api.ted.europa.eu/v3/notices/search' \
  --header 'Content-Type: application/json' \
  --header "X-API-Key: $EU_API_KEY" \
  --data "$body" | "${pretty[@]}"
