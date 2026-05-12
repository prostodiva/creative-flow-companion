
# app.repo.ts and ide.repo.ts

## A Repository has one job: be the interface between you application code and your database. It reads data, writes data, runs queries. 
The rule: if a method doesn't use this.db, it doesn't belong on a repo. Move it to a utility function where it can be used and tested independently.
Every class should answer one question cleanly. For AppRepo, that question is: "how do I read and write app activity data to SQLite?"

## async vs sync

When you mark a function async, you're telling JavaScript: "this function will do smth that takes time. Do not block, come back when it's done."

synchronous - means the code completes in microseconds.   
The library is called better-sqlite3 specifically because it chose to be synchronous.   
When you call .get() or .run(), it executes the  SQL and returns the result immediately, right there on that line. No waiting, no callbacks, no promises.

The rule: if your function only calls synchronous code, it must not be async. Lying about async is a contract violation.

## Inline SQL that ignores already-loaded files
the sql files are loaded, cached, and ready to use. The raw strung ignores the file that was loaded. 

The rule: if you have sql file for it, use the sql file always. That's what the _sql object for.


## Splitting the overloaded method
The rule: optional parameters that change which query runs are a code smell. Name the distinction explicitly.

## Look for the code duplication
The rule: if you copy-paste code within the same class, extract a private method. This is called DRY — Don't Repeat Yourself.
