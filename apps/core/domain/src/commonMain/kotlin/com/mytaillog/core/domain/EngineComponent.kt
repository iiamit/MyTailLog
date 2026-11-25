package com.mytaillog.core.domain

/** A system category includes accessories; only complete powerplants own engine history. */
fun isCompleteEngine(name: String, category: String?, kind: String? = null, model: String? = null): Boolean {
    if (kind != null) return kind == "engine"
    if (category != "engine") return false
    if (Regex("\\b(pump|magneto|alternator|starter|exhaust|muffler|filter|monitor|mount|cylinder|baffle|hose|belt|injector|governor|sensor|tachometer)\\b", RegexOption.IGNORE_CASE).containsMatchIn(name)) return false
    return Regex("\\bengine\\b|\\b(AEIO|AIO|IO|O|TSIO|TIO|GTSIO|GO|HIO|LIO)-?\\d{3}\\b|\\b(Rotax|Rotec|PT6)[ -]*\\w+", RegexOption.IGNORE_CASE).containsMatchIn("$name ${model.orEmpty()}")
}
