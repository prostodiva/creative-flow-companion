# ADR 001 vector db choice

## Context
ChromaDB RAG memory  

## Decision

## Options Considered

## Consequences

## Notes

## Why RAG over simple SQL history

The retrieval query is: "find past sessions behaviorally 
similar to right now." This is a semantic similarity 
problem — two sessions where I watched YouTube for 25min 
with 0 commits should match even if the specific apps 
or files differ. SQL WHERE clauses can filter by columns 
but can't express that kind of fuzzy behavioral similarity.

That said, at this data volume (< 500 sessions) the 
benefit is marginal. This is an explicit learning choice 
to practice RAG pipeline design, not a claim that it's 
the optimal solution at this scale.