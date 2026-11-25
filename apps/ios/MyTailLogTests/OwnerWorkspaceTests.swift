import Foundation
import Testing
@testable import MyTailLog

struct OwnerWorkspaceTests {
    @Test func monetaryInputPreservesCurrencyPrecisionAndRefunds() {
        #expect(expenseMinorUnits("12.34", currency: "USD") == 1234)
        #expect(expenseMinorUnits("-0.01", currency: "EUR") == -1)
        #expect(expenseMinorUnits("123", currency: "JPY") == 123)
        #expect(expenseMinorUnits("1.234", currency: "KWD") == 1234)
        #expect(expenseMinorUnits("1.234", currency: "USD") == nil)
        #expect(expenseMinorUnits("1.1", currency: "JPY") == nil)
        #expect(expenseMinorUnits("nan", currency: "USD") == nil)
        #expect(expenseMinorUnits("9e10", currency: "USD") == nil)
        #expect(expenseMinorUnits("999999999999999999999", currency: "USD") == nil)
    }

    @Test func compressionKeepsTheWrittenReferencePressure() {
        let standard: Row = ["cylinder": .number(1), "psi": .number(76), "reference": .number(80)]
        let different: Row = ["cylinder": .number(1), "psi": .number(76), "reference": .number(100)]
        #expect(compressionLabel(standard) == "C1: 76/80")
        #expect(compressionLabel(different) == "C1: 76/100")
    }

    @Test func contractsDoNotMixFinancialTotalsOrDropEvidenceEligibility() throws {
        let bytes = Data(#"{"expenses":[],"totals":[{"currency":"USD","actual_minor":12345,"reserve_minor":9000},{"currency":"JPY","actual_minor":500,"reserve_minor":0}],"canManage":true}"#.utf8)
        let expenses = try JSONDecoder().decode(ExpensesAnswer.self, from: bytes)
        #expect(expenses.totals.count == 2)
        #expect(expenses.totals[0].actual_minor == 12345)
        #expect(expenses.totals[0].reserve_minor == 9000)
        #expect(expenses.totals[1].currency == "JPY")
        #expect(expenses.totals[0].rate_actual_minor == nil)
        let measured = try JSONDecoder().decode(ExpensesAnswer.self, from: Data(#"{"expenses":[],"totals":[{"currency":"USD","actual_minor":60000,"reserve_minor":7500,"rate_actual_minor":20000,"actual_per_hour_minor":200}],"denominator":{"hours":100,"meter":"tach","coverage":"reviewed_meter_interval","source":"2026-01-13 through 2026-12-08"},"canManage":true}"#.utf8))
        #expect(measured.totals[0].rate_actual_minor == 20000)
        #expect(measured.totals[0].actual_per_hour_minor == 200)
        #expect(measured.denominator?.hours == 100)
        let annual = try JSONDecoder().decode(AnnualManifest.self, from: Data(#"{"tail":"N123AB","generatedAt":"2026-11-25T12:00:00Z","cutoff":"2026-11-25","warnings":["Annual evidence is missing"],"evidence":[{"id":"p1","kind":"page","label":"Engine p. 1","available":false}]}"#.utf8))
        #expect(!annual.evidence[0].available)
        #expect(annual.warnings.count == 1)
    }

    @Test func engineConsumptionUsesWeightedHoursAndRejectsIncompleteOrReversingReadings() throws {
        func row(_ date: String, _ tach: Double?, _ quarts: Double) -> Row {
            ["added_date": .string(date), "tach": tach.map(AnyJSON.number) ?? .null, "quarts": .number(quarts)]
        }
        let complete = [row("2026-01-01", 100, 1), row("2026-01-02", 110, 1), row("2026-01-03", 120, 2)]
        let consumption = try #require(engineHoursPerQuart(complete))
        #expect(abs(consumption.value - 20.0 / 3.0) < 0.0001)
        #expect(consumption.meter == "tach")
        #expect(engineHoursPerQuart([row("2026-01-01", 100, 1), row("2026-01-02", 5, 1)]) == nil)
        #expect(engineHoursPerQuart([row("2026-01-01", 100, 1), row("2026-01-02", nil, 1)]) == nil)
        #expect(engineHoursPerQuart([row("2026-01-01", 100, 1), row("2026-01-01", 110, 1)]) == nil)
    }

    @Test func proposalConversionRetainsNestedNumbersAndNulls() throws {
        let row: AnyJSON = .object(["samples": .array([.object(["oil_hours": .number(12.5), "sample_date": .null])])])
        let encoded = try JSONSerialization.data(withJSONObject: row.foundationValue)
        let decoded = try JSONDecoder().decode(AnyJSON.self, from: encoded)
        #expect(decoded == row)
    }

    @Test func exportsHaveSafeUniqueNames() throws {
        let first = try ownerFile(Data("a".utf8), name: "N123/AB annual.pdf")
        let second = try ownerFile(Data("b".utf8), name: "N123/AB annual.pdf")
        defer { try? FileManager.default.removeItem(at: first.deletingLastPathComponent()); try? FileManager.default.removeItem(at: second.deletingLastPathComponent()) }
        #expect(first != second)
        #expect(first.lastPathComponent == "N123-AB annual.pdf")
        #expect(try Data(contentsOf: first) == Data("a".utf8))
    }
}
