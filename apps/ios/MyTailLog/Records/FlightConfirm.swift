import SwiftUI

// M-FLIGHT-03 Confirm the flight and M-FLIGHT-04 Saved: tach and hobbs steppers, oil in one tap, the date (past only),
// one Save; then what the flight moved, with Undo. Everything goes through the outbox. Port of Android's Flight.kt.

extension Recs {
    /// The last tach reading and its date: the newest of the snapshot's meter and the readings on this phone.
    var lastTach: (value: Double?, date: String?) {
        var best: (value: Double, date: String)?
        if let m = snapshot?.meters["tach"], let v = m.stitched { best = (v, m.asOf ?? "") }
        for r in records("hours_reading") {
            if let v = r.d("tach"), v >= (best?.value ?? 0) { best = (v, r.s("reading_date") ?? best?.date ?? "") }
        }
        return (best?.value, best?.date.isEmpty == false ? best?.date : nil)
    }

    /// What the tach camera needs (05 §16 plausibility).
    var tachContext: TachReader.Context {
        let last = lastTach
        let days = last.date.flatMap { $0.count >= 10 ? Day.date(String($0.prefix(10))) : nil }.map { max(Date().timeIntervalSince($0) / 86_400, 1) } ?? 1
        return TachReader.Context(last: last.value, daysSinceLast: days)
    }
}

/// M-FLIGHT-02 then M-FLIGHT-03/04 as one cover: the camera first, the confirm screen with what it read, then Saved.
struct LogFlightFlow: View {
    let recs: Recs
    @State private var step: Step = .camera
    enum Step: Equatable { case camera, confirm(Double?) }

    var body: some View {
        switch step {
        case .camera:
            TachCameraScreen(model: TachCameraModel(context: recs.tachContext), meter: "tach") { step = .confirm($0) }
        case .confirm(let v):
            FlightConfirmScreen(recs: recs, read: v, cameraDenied: CameraEngine.authorized == .denied)
        }
    }
}

/// MeterStepper (02): − and + 64×64 around a value typed as-is ("4214.8" stays 4214.8); tap ±0.1, hold repeats every
/// 90 ms and after 18 ticks steps by 1.0. One adjustable element for VoiceOver.
struct MeterStepper: View {
    let label: String
    let was: String?
    @Binding var text: String
    let delta: String?
    @State private var repeating: Task<Void, Never>?

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s1) {
            HStack(alignment: .firstTextBaseline, spacing: Tokens.Space.s2) {
                Text(label).dFont(.bodyStrong)
                if let was { Note(was) }
            }
            HStack(spacing: Tokens.Space.s2) {
                key("minus", -1)
                TextField(label, text: Binding { text } set: { text = String($0.filter { $0.isNumber || $0 == "." || $0 == "," }.prefix(8)) })
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.center)
                    .font(.system(size: 34, weight: .bold).monospacedDigit())
                    .frame(maxWidth: .infinity, minHeight: 64)
                    .accessibilityHidden(true)
                key("plus", 1)
            }
            if let delta { Lede(delta) }
        }
        .foregroundStyle(Tokens.Colors.ink)
        .padding(.vertical, Tokens.Space.s2)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue([text.isEmpty ? "empty" : text, delta].compactMap { $0 }.joined(separator: ", "))
        .accessibilityAdjustableAction { d in step(d == .increment ? 0.1 : -0.1) }
    }

    private func step(_ by: Double) {
        text = fmt1(max((num(text) ?? 0) + by, 0))
        UISelectionFeedbackGenerator().selectionChanged()
    }

    private func key(_ icon: String, _ sign: Double) -> some View {
        Icon(icon, size: 28)
            .frame(width: 64, height: 64)
            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.m).strokeBorder(Tokens.Colors.controlBorder, lineWidth: 1))
            .contentShape(Rectangle())
            .onLongPressGesture(minimumDuration: 0.4, maximumDistance: 40) {} onPressingChanged: { pressing in
                repeating?.cancel()
                guard pressing else { return }
                step(0.1 * sign)
                repeating = Task {
                    try? await Task.sleep(for: .milliseconds(400))
                    var n = 0
                    while !Task.isCancelled {
                        n += 1
                        step(n > 18 ? sign : 0.1 * sign)
                        if n == 19 { UIImpactFeedbackGenerator(style: .medium).impactOccurred() }
                        try? await Task.sleep(for: .milliseconds(90))
                    }
                }
            }
            .accessibilityLabel(sign > 0 ? "Increase \(label)" : "Decrease \(label)")
    }
}

/// What one Save wrote, for M-FLIGHT-04 and its Undo.
struct SavedFlight: Equatable {
    let readingId: String?
    let oilId: String?
    let tach: Double?
    let lastTach: Double?
    let hobbs: Double?
    let lastHobbs: Double?
    let quarts: Double?
}

struct FlightConfirmScreen: View {
    let recs: Recs
    /// The value the camera read, or nil when typed.
    let read: Double?
    let cameraDenied: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var last: (value: Double?, date: String?) = (nil, nil)
    @State private var lastHobbs: Double?
    @State private var tach = ""
    @State private var hobbs = ""
    @State private var hobbsOn = false
    @State private var oil = 0
    @State private var oilOther = ""
    @State private var date: String? = todayISO()
    @State private var asking = false
    @State private var saved: SavedFlight?
    @State private var loaded = false

    private var t: Double? { num(tach) }
    private var h: Double? { hobbsOn ? num(hobbs) : nil }
    private var quarts: Double? { oil == 1 ? 1 : oil == 2 ? 2 : oil == 3 ? num(oilOther) : nil }
    private var tachMoved: Bool { t != nil && t != last.value }
    private var hobbsMoved: Bool { h != nil && h != lastHobbs }
    private var lower: Bool { if let t, let l = last.value { t < l } else { false } }

    var body: some View {
        NavigationStack {
            Group {
                if let saved { FlightSaved(recs: recs, f: saved) { dismiss() } } else { form }
            }
            .background(Tokens.Colors.leaf)
            .environment(\.section, .aircraft)
        }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            last = recs.lastTach
            lastHobbs = recs.meter("hobbs")
            hobbsOn = lastHobbs != nil // hours-only aircraft: hobbs hidden by default
            hobbs = fmt1(lastHobbs)
            tach = read.map(fmt1) ?? fmt1(last.value)
        }
    }

    private var form: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if cameraDenied { Note("Allow the camera in Settings to read the tach from a photo.") }
                if read != nil {
                    Well { Text("Read from your photo").dFont(.bodyStrong); Note("Check it against the meter.") }
                }
                MeterStepper(label: "Tach", was: last.value.map { v in "was \(fmt1(v))\(last.date.map { " on \(dayDate($0))" } ?? "")" }, text: $tach,
                             delta: t.flatMap { t in last.value.flatMap { t >= $0 ? "\(fmt1(t - $0)) hours this flight" : nil } })
                if lower, let l = last.value { Well(alarm: true) { Text("Lower than the last reading (\(fmt1(l))).").dFont(.small) } }
                // The mini line ahead in words: what the next hours-limited item does as the tach goes up.
                if let t, let next = recs.snapshot?.items.filter({ $0.hours?.meter == "tach" }).min(by: { $0.hours!.dueAt < $1.hours!.dueAt }), let due = next.hours?.dueAt {
                    Note("\(next.label) now \(fmt1(due - t)) h away, was \(fmt1(due - (last.value ?? t))) h").padding(.bottom, Tokens.Space.s2)
                }
                if hobbsOn {
                    MeterStepper(label: "Hobbs", was: lastHobbs.map { "was \(fmt1($0))" }, text: $hobbs,
                                 delta: h.flatMap { h in lastHobbs.flatMap { h >= $0 ? "\(fmt1(h - $0)) hours" : nil } })
                    Button("Not this time") { hobbsOn = false }.buttonStyle(.quiet)
                } else {
                    HStack {
                        Note("Hobbs not recorded this time")
                        Spacer()
                        Button("Record it") { hobbsOn = true }.buttonStyle(.quiet)
                    }
                }
                Note("Oil added").padding(.top, Tokens.Space.s2)
                Segments(label: "Oil added", options: ["None", "1 qt", "2 qt", "Other"], selection: $oil)
                if oil == 3 { TextBox(label: "Quarts", text: $oilOther, number: true, placeholder: "0.5") }
                DateRow(label: "Date", date: $date)
            }
            .padding(.horizontal, Tokens.Space.s4)
        }
        .safeAreaInset(edge: .bottom) {
            Button("Save flight") { if lower { asking = true } else { save(reset: false) } }
                .buttonStyle(.primary)
                .disabled(!(tachMoved || hobbsMoved || (quarts ?? 0) > 0) || date == nil)
                .padding(Tokens.Space.s4).background(Tokens.Colors.leaf)
        }
        .navigationTitle("Log a flight")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        .confirmationDialog("Lower than the last reading. Was the tach replaced?", isPresented: $asking, titleVisibility: .visible) {
            Button("Yes, a new meter from that day") { save(reset: true) }
            Button("It's right as typed") { save(reset: false) }
            Button("I mistyped it", role: .cancel) {}
        } message: { Text("\(fmt1(last.value)) → \(fmt1(t))") }
    }

    private func save(reset: Bool) {
        let day = date ?? todayISO()
        if reset, let t {
            let rid = newId()
            recs.change("meterReset.create", "meter_reset", rid, "Tach replaced", payload(["id": rid, "meter": "tach", "date": day, "prior": last.value, "next": t]))
        }
        var readingId: String?
        if tachMoved || hobbsMoved {
            let id = newId()
            var p = payload(["id": id, "date": day, "tach": tachMoved ? t : nil, "hobbs": hobbsMoved ? h : nil, "source": read != nil ? "tach_photo" : "manual"])
            if let read { p["ocrValue"] = read; p["ownerEdited"] = t.map { abs($0 - read) > 0.01 } ?? true }
            readingId = recs.change("reading.create", "hours_reading", id, flightLabel(last: last.value, now: t ?? 0), p) != nil ? id : nil
        }
        var oilId: String?
        if let q = quarts, q > 0 {
            let oid = newId()
            oilId = recs.change("oil.create", "oil_addition", oid, "Oil, \(fmtNum(q)) qt", payload(["id": oid, "date": day, "quarts": q, "tach": t])) != nil ? oid : nil
        }
        saved = SavedFlight(readingId: readingId, oilId: oilId, tach: tachMoved ? t : nil, lastTach: last.value, hobbs: hobbsMoved ? h : nil,
                            lastHobbs: lastHobbs, quarts: oilId != nil ? quarts : nil)
    }
}

/// M-FLIGHT-04 Saved: what the flight logged and moved, with Undo.
private struct FlightSaved: View {
    let recs: Recs
    let f: SavedFlight
    let done: () -> Void

    var body: some View {
        let items = recs.snapshot?.items ?? []
        let moved = (f.tach.flatMap { t in f.lastTach.map { movedBy(items, meter: "tach", before: $0, after: t) } } ?? [])
            + (f.hobbs.flatMap { h in f.lastHobbs.map { movedBy(items, meter: "hobbs", before: $0, after: h) } } ?? [])
        let logged = [f.tach.map { t in f.lastTach.flatMap { t >= $0 ? "Logged \(fmt1(t - $0)) h, tach \(fmt1(t))" : nil } ?? "Tach \(fmt1(t))" },
                      f.hobbs.map { "hobbs \(fmt1($0))" }].compactMap { $0 }.joined(separator: ", ")
        let lead = moved.min { $0.after < $1.after }.map { "\($0.label) now \(fmt1($0.after)) h away. " } ?? ""
        let sentence = lead + [logged.isEmpty ? nil : logged, f.quarts.map { "\(fmtNum($0)) qt of oil" }].compactMap { $0 }.joined(separator: ", with ") + "."
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                Icon("circle-check", size: 28).foregroundStyle(Tokens.Colors.ink)
                Text(sentence).dFont(.lede).foregroundStyle(Tokens.Colors.ink).fixedSize(horizontal: false, vertical: true).accessibilityAddTraits(.isHeader)
                if !recs.online { Note("On this phone. It uploads when you have signal.") }
                if !moved.isEmpty {
                    GroupHeader(title: "What it moved")
                    ForEach(moved, id: \.label) { m in
                        RecRow(m.label, lines: ["was \(fmt1(m.before)) h → \(fmt1(m.after)) h"]) {
                            StatusMark(kind: markKind(m.status), label: statusWord(m.status), compact: true)
                        }
                    }
                    Note("Calendar items did not change.").padding(.top, Tokens.Space.s2)
                }
            }
            .padding(Tokens.Space.s4)
        }
        .safeAreaInset(edge: .bottom) {
            HStack(spacing: Tokens.Space.s2) {
                Button { undo() } label: { Label { Text("Undo") } icon: { Icon("undo-2", size: 18) } }.buttonStyle(.secondary)
                Button("Done", action: done).buttonStyle(.primary)
            }
            .padding(Tokens.Space.s4).background(Tokens.Colors.leaf)
        }
        .navigationTitle(f.readingId != nil ? "Flight saved" : "Oil saved")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden()
    }

    private func undo() {
        if let r = f.readingId { recs.delete("reading.delete", "hours_reading", r, "Remove flight", ["readingId": r]) }
        if let o = f.oilId { recs.delete("oil.delete", "oil_addition", o, "Remove oil", ["additionId": o]) }
        recs.say("Flight removed.")
        done()
    }
}
