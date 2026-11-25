import Foundation

struct AnnualManifest: Decodable, Sendable {
    struct Evidence: Decodable, Identifiable, Sendable {
        let id: String
        let kind: String
        let label: String
        let available: Bool
    }
    let tail: String
    let generatedAt: String
    let cutoff: String
    let warnings: [String]
    let evidence: [Evidence]
}

struct InboxAnswer: Decodable {
    let items: [Row]
    let logbooks: [Row]
    let canEdit: Bool
}

struct ExpensesAnswer: Decodable {
    struct Total: Decodable, Identifiable {
        let currency: String
        let actual_minor: Int64
        let reserve_minor: Int64
        let actual_per_hour_minor: Double?
        let rate_actual_minor: Int64?
        var id: String { currency }
    }
    struct Denominator: Decodable {
        let hours: Double?
        let meter: String?
        let source: String
        let coverage: String
    }
    let expenses: [Row]
    let denominator: Denominator?
    let entries: [Row]?
    let documents: [Row]?
    let totals: [Total]
    let canManage: Bool
}

struct EngineHistoryAnswer: Decodable {
    let components: [Row]
    let events: [Row]
    let groups: [Row]
    let unassigned: Row
    let needsReview: [Row]
}

extension Dictionary where Key == String, Value == AnyJSON {
    func ownerRows(_ key: String) -> [Row] {
        guard case .array(let values)? = self[key] else { return [] }
        return values.compactMap { if case .object(let row) = $0 { row } else { nil } }
    }
    func ownerObject(_ key: String) -> Row {
        if case .object(let row)? = self[key] { row } else { [:] }
    }
}

/// Decimal input goes straight to integer minor units; never round a binary floating-point amount.
func expenseMinorUnits(_ input: String, currency: String) -> Int64? {
    guard ownerCurrencies.contains(currency) else { return nil }
    let digits = currency == "JPY" ? 0 : ["BHD", "KWD", "OMR"].contains(currency) ? 3 : 2
    let cleaned = input.trimmingCharacters(in: .whitespacesAndNewlines)
    guard cleaned.range(of: #"^-?\d+(?:\.\d+)?$"#, options: .regularExpression) != nil,
          let value = Decimal(string: cleaned, locale: Locale(identifier: "en_US_POSIX")) else { return nil }
    var scale = Decimal(1)
    for _ in 0..<digits { scale *= 10 }
    var scaled = value * scale
    var rounded = Decimal()
    NSDecimalRound(&rounded, &scaled, 0, .plain)
    guard rounded == scaled, rounded != 0, abs(rounded) <= 9_000_000_000_000 else { return nil }
    return NSDecimalNumber(decimal: rounded).int64Value
}

func expenseAmount(_ minor: Int64, currency: String) -> String {
    let digits = currency == "JPY" ? 0 : ["BHD", "KWD", "OMR"].contains(currency) ? 3 : 2
    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    formatter.currencyCode = currency
    formatter.minimumFractionDigits = digits
    formatter.maximumFractionDigits = digits
    return formatter.string(from: NSDecimalNumber(value: minor).dividing(by: NSDecimalNumber(mantissa: 1, exponent: Int16(digits), isNegative: false))) ?? "\(minor) \(currency) minor units"
}

func compressionLabel(_ reading: Row) -> String {
    "C\(reading["cylinder"]?.text ?? "?"): \(reading["psi"]?.text ?? "?")/\(reading["reference"]?.text ?? "?")"
}

func ownerFile(_ data: Data, name: String) throws -> URL {
    let dir = FileManager.default.temporaryDirectory.appending(path: "owner-exports/\(UUID().uuidString)", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let url = dir.appending(path: name.replacingOccurrences(of: "/", with: "-"))
    try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    return url
}

extension AnyJSON {
    var foundationValue: Any {
        switch self {
        case .string(let v): v
        case .number(let v): v
        case .bool(let v): v
        case .array(let v): v.map(\.foundationValue)
        case .object(let v): v.mapValues(\.foundationValue)
        case .null: NSNull()
        }
    }
}

func expenseMajorUnits(_ minor: Int64, currency: String) -> String {
    let digits = currency == "JPY" ? 0 : ["KWD", "BHD", "OMR"].contains(currency) ? 3 : 2
    return NSDecimalNumber(decimal: Decimal(minor) / pow(Decimal(10), digits)).stringValue
}

func expenseRateAmount(_ minor: Double, currency: String) -> String {
    guard minor.isFinite else { return "Unavailable" }
    let digits = currency == "JPY" ? 0 : ["KWD", "BHD", "OMR"].contains(currency) ? 3 : 2
    return (minor / pow(10, Double(digits))).formatted(.currency(code: currency))
}

/// Only a complete, monotonic sequence within one engine/service period supports a consumption rate.
func engineHoursPerQuart(_ additions: [Row]) -> (value: Double, meter: String)? {
    let sorted = additions.sorted { ($0["added_date"]?.text ?? "") < ($1["added_date"]?.text ?? "") }
    guard sorted.count >= 2, sorted.allSatisfy({ $0["added_date"]?.text != nil }),
          Set(sorted.compactMap { $0["added_date"]?.text }).count == sorted.count else { return nil }
    let meter: String
    if sorted.allSatisfy({ $0["hobbs"]?.number != nil }) { meter = "hobbs" }
    else if sorted.allSatisfy({ $0["tach"]?.number != nil }) { meter = "tach" }
    else { return nil }
    let readings = sorted.compactMap { $0[meter]?.number }
    guard readings.allSatisfy({ $0.isFinite && $0 >= 0 }), zip(readings, readings.dropFirst()).allSatisfy({ $1 > $0 }),
          sorted.dropFirst().allSatisfy({ ($0["quarts"]?.number ?? 0) > 0 }) else { return nil }
    let totalQuarts = sorted.dropFirst().reduce(0.0) { $0 + ($1["quarts"]?.number ?? 0) }
    guard totalQuarts.isFinite, totalQuarts > 0 else { return nil }
    return ((readings.last! - readings.first!) / totalQuarts, meter)
}

func isCompleteEngine(_ c: Rec) -> Bool {
    if let kind = c.s("component_kind") { return kind == "engine" }
    guard c.s("category") == "engine" else { return false }
    let name = c.s("name") ?? ""
    if name.range(of: #"\b(pump|magneto|alternator|starter|exhaust|muffler|filter|monitor|mount|cylinder|baffle|hose|belt|injector|governor|sensor|tachometer)\b"#, options: [.regularExpression, .caseInsensitive]) != nil { return false }
    return "\(name) \(c.s("model") ?? "")".range(of: #"\bengine\b|\b(AEIO|AIO|IO|O|TSIO|TIO|GTSIO|GO|HIO|LIO)-?\d{3}\b|\b(Rotax|Rotec|PT6)[ -]*\w+"#, options: [.regularExpression, .caseInsensitive]) != nil
}
