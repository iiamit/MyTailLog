import CoreSpotlight
import Foundation
import UniformTypeIdentifiers

// System search (05 §14): confirmed and signed entries and tracked items, one domain per aircraft so signing out or
// losing access removes a whole aircraft in one call. Entries read by AI and not yet confirmed are never indexed: the
// system result cannot carry the TrustMark. Settings › "Show records in phone search" (default on) turns it off.
// shortcut: entries and tracked items only; add ADs, documents and open squawks when their mirror rows are typed.

struct SpotlightRecord: Equatable, Sendable {
    let id: String
    let title: String
    let detail: String
    let keywords: [String]
    let url: URL
}

enum Spotlight {
    static let enabledKey = "spotlight.on"
    static var enabled: Bool { UserDefaults.standard.object(forKey: enabledKey) as? Bool ?? true }

    /// "Engine overhaul" from "Engine overhaul. Removed and replaced…": the entry's first sentence in the owner's words.
    static func firstSentence(_ s: String) -> String {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        let end = t.firstIndex { ".\n".contains($0) } ?? t.endIndex
        return String(t[..<end].prefix(80))
    }

    static func records(aircraftId: String, tail: String, entries: [EntryRow], logbooks: [LogbookRow], pages: [PageRow],
                        items: [DueItem]) -> [SpotlightRecord] {
        let books = Dictionary(logbooks.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let pageSeq = Dictionary(pages.map { ($0.id, $0.page_sequence) }, uniquingKeysWith: { a, _ in a })
        let confirmed = entries.filter { $0.trust != "ai_read" }.compactMap { e -> SpotlightRecord? in
            let text = e.description ?? e.work_performed ?? ""
            guard !text.isEmpty else { return nil }
            let book = books[e.logbook_id].map(\.name)
            let page = e.page_id.flatMap { pageSeq[$0] ?? nil }.map { "p. \($0)" }
            let detail = [book, e.entry_date.map(Day.format), e.tach.map { "tach \(hours1($0))" }, page].compactMap { $0 }.joined(separator: " · ")
            return SpotlightRecord(id: "entry-\(e.id)", title: firstSentence(text), detail: detail,
                                   keywords: [tail] + [book].compactMap { $0 } + (e.ad_refs ?? []),
                                   url: AppLinks.url(aircraftId, "entry/\(e.id)"))
        }
        let tracked = items.filter { $0.status != "no_record" }.map { i in
            let due = i.calendar.map { "due \(Day.format($0.dueDate))" } ?? i.hours.map { "due at \(hours1($0.dueAt)) \($0.meter)" }
            return SpotlightRecord(id: "item-\(i.key)", title: i.label, detail: [due, tail].compactMap { $0 }.joined(separator: " · "),
                                   keywords: [tail], url: AppLinks.url(aircraftId, "item/\(i.key)"))
        }
        return confirmed + tracked
    }

    /// Replaces one aircraft's items (500 per batch, 05 §9).
    static func index(aircraftId: String, _ records: [SpotlightRecord]) async {
        let index = CSSearchableIndex.default()
        try? await index.deleteSearchableItems(withDomainIdentifiers: [aircraftId])
        guard enabled else { return }
        let items = records.map { r in
            let a = CSSearchableItemAttributeSet(contentType: .text)
            a.title = r.title
            a.contentDescription = r.detail
            a.keywords = r.keywords
            a.contentURL = r.url
            return CSSearchableItem(uniqueIdentifier: r.url.absoluteString, domainIdentifier: aircraftId, attributeSet: a)
        }
        for start in stride(from: 0, to: items.count, by: 500) {
            try? await index.indexSearchableItems(Array(items[start..<min(start + 500, items.count)]))
        }
    }

    /// Sign-out, or the setting turned off.
    static func clear() async { try? await CSSearchableIndex.default().deleteAllSearchableItems() }
}
