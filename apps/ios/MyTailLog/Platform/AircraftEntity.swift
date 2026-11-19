import AppIntents
import Foundation

// The aircraft as an App Intents entity (05 §13.1), read from the App Group list the app writes, so the widgets'
// configuration and Siri work without the app running. Shared with the widget extension.

struct AircraftEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Aircraft"
    static let defaultQuery = AircraftQuery()

    let id: String
    let tail: String

    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(tail)") }
}

struct AircraftQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [AircraftEntity] {
        SharedSnapshots.aircraft().filter { identifiers.contains($0.id) }.map { AircraftEntity(id: $0.id, tail: $0.tail) }
    }

    func entities(matching string: String) async throws -> [AircraftEntity] {
        let list = SharedSnapshots.aircraft()
        return matchTail(string, list.map(\.tail)).compactMap { t in list.first { $0.tail == t } }.map { AircraftEntity(id: $0.id, tail: $0.tail) }
    }

    func suggestedEntities() async throws -> [AircraftEntity] {
        SharedSnapshots.aircraft().map { AircraftEntity(id: $0.id, tail: $0.tail) }
    }

    func defaultResult() async -> AircraftEntity? {
        SharedSnapshots.pick(nil).map { AircraftEntity(id: $0.id, tail: $0.tail) }
    }
}

/// Tails matching what was typed or said: "N734DM", "734DM", or "November seven three four Delta Mike".
func matchTail(_ said: String, _ tails: [String]) -> [String] {
    let spoken = spokenTail(said)
    guard !spoken.isEmpty else { return [] }
    return tails.filter { t in
        let u = t.uppercased()
        return u == spoken || u == "N" + spoken || u.contains(spoken)
    }
}

/// The ICAO alphabet and spoken digits folded to characters; anything else keeps its letters and digits.
func spokenTail(_ said: String) -> String {
    let words: [String: String] = [
        "alfa": "A", "alpha": "A", "bravo": "B", "charlie": "C", "delta": "D", "echo": "E", "foxtrot": "F", "golf": "G",
        "hotel": "H", "india": "I", "juliet": "J", "juliett": "J", "kilo": "K", "lima": "L", "mike": "M", "november": "N",
        "oscar": "O", "papa": "P", "quebec": "Q", "romeo": "R", "sierra": "S", "tango": "T", "uniform": "U", "victor": "V",
        "whiskey": "W", "whisky": "W", "xray": "X", "x-ray": "X", "yankee": "Y", "zulu": "Z",
        "zero": "0", "one": "1", "two": "2", "three": "3", "tree": "3", "four": "4", "five": "5", "fife": "5",
        "six": "6", "seven": "7", "eight": "8", "nine": "9", "niner": "9",
    ]
    return said.lowercased().split(whereSeparator: { $0 == " " || $0 == "," }).map { w in
        words[String(w)] ?? String(w).uppercased().filter { $0.isLetter || $0.isNumber }
    }.joined()
}

/// The widgets' one setting: which aircraft (05 §11.2; the horizon is fixed at 60 days). Default: the last opened.
struct PickAircraftIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Aircraft"
    static let description = IntentDescription("The aircraft this widget shows.")

    @Parameter(title: "Aircraft")
    var aircraft: AircraftEntity?

    init() {}
}
