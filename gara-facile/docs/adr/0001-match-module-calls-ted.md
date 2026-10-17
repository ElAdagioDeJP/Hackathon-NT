# Match module calls TED

Find matches needs a Candidate set. We considered accepting Contract Models from an external caller (keeping TED in C0 only), but for the hackathon vertical slice the Match module builds the TED query from the Business Model and fetches notices itself. Contract mapping stays at the Match boundary; a later split can extract C0 without changing Match Model storage.
