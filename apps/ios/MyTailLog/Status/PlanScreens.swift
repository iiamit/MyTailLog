import SwiftUI

// Plan ahead (06 M-STATUS-03, T-STATUS-02) and one visit (M-STATUS-04). Everything is worked out on the phone from the
// snapshot with core's planDate, so it works offline; the 24-month visits come from the server when there is signal and
// fall back to the snapshot's 12 months. Port of Android's PlanScreens.kt.

/// What Plan ahead holds while it is open: the date, the hours, the visits over its horizon, and planDate's answers.
@MainActor @Observable
final class PlanModel {
    let recs: Recs
    let today: String
    let scale: PlanScale
    private let status: Data?
    private var visitsRaw: String?
    private(set) var visits: [VisitView]
    private(set) var plan: PlanResult?
    /// Where every item lapses inside the horizon, for the rings.
    private(set) var horizon: PlanResult?
    var date: String { didSet { if date != oldValue { work(); Self.kept[recs.id] = (date, hoursPerWeek) } } }
    var hoursPerWeek: Double? { didSet { if hoursPerWeek != oldValue { work(rings: true); Self.kept[recs.id] = (date, hoursPerWeek) } } }

    /// The date and hours stay with the aircraft while the app runs, so coming back finds the same plan.
    private static var kept: [String: (String, Double?)] = [:]

    init(recs: Recs, snapshot: StatusSnapshot) {
        self.recs = recs
        today = snapshot.today
        scale = PlanScale(today: snapshot.today)
        status = recs.offline.cachedStatusData(recs.id)
        visits = snapshot.visits?.all ?? []
        let k = Self.kept[recs.id]
        date = k?.0 ?? addMonths(3, snapshot.today)
        hoursPerWeek = k.map(\.1) ?? (snapshot.rate.basis == "none" ? nil : snapshot.rate.hoursPerWeek)
        work(rings: true)
    }

    private func work(rings: Bool = false) {
        guard let status else { return }
        plan = planDate(status: status, visits: visitsRaw, date: date, hoursPerWeek: hoursPerWeek)
        if rings { horizon = planDate(status: status, visits: visitsRaw, date: scale.end, hoursPerWeek: hoursPerWeek) }
    }

    /// The 24-month visits, when there is signal.
    func loadVisits() async {
        guard recs.online, let v = try? await recs.api.visits(aircraftId: recs.id) else { return }
        visits = v.visits.all
        visitsRaw = v.raw
        work(rings: true)
    }

    var items: [DueItem] { recs.snapshot?.items ?? [] }
    func item(_ key: String) -> DueItem? { items.first { $0.key == key } }
    /// The visit covering the first thing to lapse, for the pinned button.
    var firstVisit: VisitView? { plan?.lapsedBy.first.flatMap { coveringVisit($0.coveredByVisit, visits) } }
}

/// M-STATUS-03 on the phone, T-STATUS-02 on the tablet: the controls and the results, the primary pinned under them.
struct PlanAheadScreen: View {
    let recs: Recs
    @State private var model: PlanModel?
    @State private var openKey: String?
    @Environment(\.recNav) private var nav

    var body: some View {
        Group {
            if let model {
                if nav.tablet {
                    VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                        BackRow(title: "Plan ahead", back: "Status")
                        HStack(alignment: .top, spacing: Tokens.Size.leavesGap) {
                            TabletLeaf { PlanControls(model: model) }
                            RecLeaf { PlanResults(model: model, onItem: { openKey = $0 }) } footer: { PlanPrimary(model: model) }                        }
                    }
                } else {
                    RecScreen(section: .status, title: "Plan ahead", back: "Status") {
                        PlanControls(model: model)
                        PlanResults(model: model, onItem: { openKey = $0 })
                    } footer: { PlanPrimary(model: model) }
                }
            } else {
                RecScreen(section: .status, title: "Plan ahead", back: "Status") {
                    EmptyLine(text: "Plan ahead needs the status from your last sync. Open Status with signal once.")
                }
            }
        }
        .task {
            if model == nil, let snap = recs.snapshot { model = PlanModel(recs: recs, snapshot: snap) }
            await model?.loadVisits()
        }
        .sheet(isPresented: Binding { openKey != nil } set: { if !$0 { openKey = nil } }) {
            ItemSheet(recs: recs, key: openKey ?? "")
        }
    }
}

/// The tablet's back row and title over the leaves (as RecScreen draws it).
struct BackRow: View {
    let title: String
    let back: String
    @Environment(\.recNav) private var nav
    @Environment(\.section) private var section

    var body: some View {
        Button { nav.back() } label: {
            HStack(spacing: 2) { Icon("chevron-left"); Text(back).dFont(.bodyStrong, weight: 600) }
                .foregroundStyle(section.onBoard).frame(minHeight: Tokens.Size.phoneTouchMin).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Back to \(back)")
        Text(title).dFont(.heading).foregroundStyle(section.onBoard).accessibilityAddTraits(.isHeader)
    }
}

/// An item's detail as a sheet (M-STATUS-05 from Plan ahead and a visit).
struct ItemSheet: View {
    let recs: Recs
    let key: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                if let snap = recs.snapshot, let item = snap.items.first(where: { $0.key == key }) {
                    ItemDetail(item: item, snapshot: snap).padding(Tokens.Space.s4)
                }
            }
            .background(Tokens.Colors.leaf)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(Tokens.Colors.leaf)
    }
}

/// Pace and the hours chip, then the line ahead with its DateScrubber (T-STATUS-02's left leaf).
struct PlanControls: View {
    let model: PlanModel
    @State private var editing = false

    var body: some View {
        Button { editing = true } label: {
            HStack(spacing: Tokens.Space.s1) {
                Text(model.hoursPerWeek.map { "\(hours1($0)) h a week" } ?? "No pace set, so hours limits aren't counted")
                    .dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(model.plan?.hoursUntil.map { "+\(Int($0.rounded())) h" } ?? "Set hours").dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink)
                Icon("chevrons-up-down", size: 16).foregroundStyle(Tokens.Colors.ink)
            }
            .frame(minHeight: Tokens.Size.phoneTouchMin)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Changes the hours you expect to fly")
        PlanLine(model: model)
            .sheet(isPresented: $editing) { HoursSheet(model: model) }
    }
}

/// The statement, what lapses and which visit covers it, close behind, and what can't be checked.
struct PlanResults: View {
    let model: PlanModel
    let onItem: (String) -> Void
    @Environment(\.recNav) private var nav

    var body: some View {
        if let p = model.plan {
            let statement = planStatement(p, today: model.today)
            Verdict(text: statement.text, emphasis: statement.emphasis).padding(.top, Tokens.Space.s4)
            if !p.lapsedBy.isEmpty {
                GroupHeader(title: "Lapsed by \(dayDate(p.date, today: model.today))", count: "covered by")
                ForEach(p.lapsedBy, id: \.key) { l in
                    if let item = model.item(l.key) { lapseRow(l, item) }
                }
            }
            if let close = closeBehind(p, model.items, today: model.today) { Note(close).padding(.top, Tokens.Space.s3) }
            ForEach(p.cannotCheck, id: \.key) { x in
                if let label = model.item(x.key)?.label {
                    if x.reason == "no_date" { Note("\(label) still has no date on file.").padding(.top, Tokens.Space.s2) }
                    else if x.reason == "no_recent_flying" { Note("\(label) goes by hours. Set your hours to see when it lapses.").padding(.top, Tokens.Space.s2) }
                }
            }
        } else {
            Note("Plan ahead couldn't read the status on this phone. Pull to refresh Status, then try again.", alarm: true)
        }
    }

    private func lapseRow(_ l: PlanResult.Lapse, _ item: DueItem) -> some View {
        let v = coveringVisit(l.coveredByVisit, model.visits)
        let due = l.when == "already" ? "lapsed already" : "due \(l.dueDate.map { dayDate($0, today: model.today) } ?? "")"
        return HStack(spacing: Tokens.Space.s3) {
            Button { onItem(item.key) } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.label).dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink)
                    FlowLayout {
                        if let name = bookName(item.line) { LineChip(line: item.line, label: name).fixedSize() }
                        Note(due).fixedSize()
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(item.label), \(due)")
            if let v {
                Button("\(visitDay(v, today: model.today)) visit") { nav.open(.visit(visitKey(v))) }
                    .dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink).underline()
                    .fixedSize()
                    .frame(minHeight: Tokens.Size.phoneTouchMin)
            } else {
                Note("No visit yet")
            }
        }
        .padding(.vertical, Tokens.Space.s2)
        .frame(minHeight: Tokens.Size.phoneRowMin)
        .overlay(alignment: .bottom) { Rule() }
    }
}

/// The pinned primary (M-STATUS-03): open the visit covering the first lapse, else a reminder before the date
/// (`reminder.snooze` for what lapses with no visit; queues offline). Nothing lapsing, nothing to press.
struct PlanPrimary: View {
    let model: PlanModel
    @Environment(\.recNav) private var nav

    var body: some View {
        if let v = model.firstVisit {
            Button { nav.open(.visit(visitKey(v))) } label: {
                Label { Text("Open the \(visitDay(v, today: model.today)) visit") } icon: { Icon("merge", size: 18) }
            }
            .buttonStyle(.primary)
        } else if let p = model.plan {
            let loose = p.lapsedBy.filter { $0.coveredByVisit == nil }.compactMap { model.item($0.key) }
            if !loose.isEmpty {
                let r = remindAt(planDate: p.date)
                Button { remind(loose, r) } label: { Label { Text(r.label) } icon: { Icon("bell", size: 18) } }
                    .buttonStyle(.primary)
            }
        }
    }

    private func remind(_ items: [DueItem], _ r: (label: String, at: Date)) {
        let until = ISO8601DateFormatter().string(from: r.at)
        for i in items {
            let id = newId()
            do {
                try model.recs.offline.enqueue(id: id, type: "reminder.snooze", aircraftId: model.recs.id,
                                               payload: ["id": id, "itemKey": i.key, "dueSignature": dueSignature(i), "until": until],
                                               label: "Remind me about \(i.label)")
            } catch {
                model.recs.say("Not saved: that didn't save on this phone. Try again.")
                return
            }
        }
        let when = r.label.replacingOccurrences(of: "Remind me ", with: "")
        model.recs.say(model.recs.online ? "We'll remind you \(when)." : "We'll remind you \(when). Saved on this phone.")
    }
}

/// The hours sheet (M-STATUS-03): hours flown by the date, which sets the pace used for it.
private struct HoursSheet: View {
    let model: PlanModel
    @State private var hours = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let days = max(Day.between(model.today, model.date), 1)
        let rate = model.recs.snapshot?.rate
        RecSheet(title: "Hours by \(dayDate(model.date, today: model.today))") {
            TextBox(label: "Hours you expect to fly", text: $hours, number: true)
            Note(rate == nil || rate?.basis == "none" ? "There's no recent flying on record, so hours limits wait for your estimate."
                 : "Your recent pace is about \(hours1(rate!.hoursPerWeek)) hours a week.")
            Button("Use this") {
                model.hoursPerWeek = Int(hours).map { (Double($0) * 7 / Double(days) * 10).rounded() / 10 }
                dismiss()
            }
            .buttonStyle(.primary)
            .disabled(Int(hours) == nil)
            .padding(.top, Tokens.Space.s4)
        }
        .presentationDetents([.medium])
        .onAppear { hours = model.plan?.hoursUntil.map { "\(Int($0.rounded()))" } ?? "" }
        .onChange(of: hours) { hours = String(hours.filter(\.isNumber).prefix(4)) }
    }
}

/// LineAhead with the DateScrubber (10 §8.3): 24 months, the first six at double scale; rings where items lapse, solid
/// inside the bracket from today to the marker; suggested and booked visits as dashed caps. Drag the marker (snaps to
/// days, a tick per ring crossed); tap a cap to open its visit, anywhere else to move the marker there. VoiceOver hears
/// one adjustable element that moves a week per swipe, with an action per visit.
struct PlanLine: View {
    let model: PlanModel
    @State private var width: CGFloat = 0
    @Environment(\.recNav) private var nav
    @Environment(\.legibilityWeight) private var legibilityWeight

    private let pad: CGFloat = 12, top: CGFloat = 44, gap: CGFloat = 32
    private var bottom: CGFloat { top + CGFloat(LineGeometry.lines.count - 1) * gap }

    private struct RingAt { let item: DueItem; let date: String; let row: Int }

    private var rings: [RingAt] {
        (model.horizon?.lapsedBy ?? []).compactMap { l in
            guard let item = model.item(l.key), let row = LineGeometry.row(item.line ?? ""),
                  let date = l.when == "already" ? model.today : l.dueDate else { return nil }
            return RingAt(item: item, date: date, row: row)
        }
    }

    private var lapsing: Int { model.plan?.lapsedBy.count ?? 0 }

    var body: some View {
        Canvas { ctx, size in draw(ctx, size) }
            .frame(height: 220)
            .padding(.top, Tokens.Space.s3)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 2).onChanged { move(to: $0.location.x) })
            .onTapGesture { tap($0) }
            .sensoryFeedback(.selection, trigger: lapsing)
            .accessibilityElement()
            .accessibilityLabel("Plan date")
            .accessibilityValue("\(longDate(model.date)). \(lapsing == 0 ? "Nothing tracked lapses" : "\(word(lapsing).prefix(1).uppercased() + word(lapsing).dropFirst()) \(lapsing == 1 ? "item lapses" : "items lapse")")")
            .accessibilityHint("Swipe up or down to move a week.")
            .accessibilityAdjustableAction { direction in
                let next = Day.adding(direction == .increment ? 7 : -7, to: model.date)
                model.date = min(max(next, Day.adding(1, to: model.today)), model.scale.end)
            }
            .accessibilityActions {
                ForEach(model.visits.map { (visitKey($0), $0) }, id: \.0) { _, v in
                    Button("Open the \(visitDay(v, today: model.today)) visit") { nav.open(.visit(visitKey(v))) }
                }
            }
    }

    private func x(_ d: String) -> CGFloat { pad + model.scale.x(d) * (width - 2 * pad) }

    private func move(to px: CGFloat) {
        guard width > 2 * pad else { return }
        model.date = model.scale.date((px - pad) / (width - 2 * pad))
    }

    private func tap(_ p: CGPoint) {
        if p.y < bottom + 14, let v = model.visits.first(where: { abs(x($0.weekOf) - p.x) < 16 }) {
            nav.open(.visit(visitKey(v)))
        } else {
            move(to: p.x)
        }
    }

    private func draw(_ ctx: GraphicsContext, _ size: CGSize) {
        let w = size.width - 2 * pad
        let font = DType.caption.font(boldText: legibilityWeight == .bold, traits: UITraitCollection(preferredContentSizeCategory: .large))
        let strong = DType.small.font(boldText: true, traits: UITraitCollection(preferredContentSizeCategory: .large), weight: 800)
        func label(_ s: String) -> GraphicsContext.ResolvedText { ctx.resolve(Text(s).font(font).foregroundStyle(Tokens.Colors.ink3)) }
        let mx = x(model.date)
        // The win bracket: today to the marker.
        ctx.fill(Path(CGRect(x: pad, y: top - 14, width: max(mx - pad, 0), height: bottom - top + 28)), with: .color(Tokens.Colors.leaf2))
        for (i, line) in LineGeometry.lines.enumerated() {
            let y = top + CGFloat(i) * gap
            ctx.draw(label(bookName(line) ?? line), at: CGPoint(x: pad, y: y - 6), anchor: .bottomLeading)
            var p = Path(); p.move(to: CGPoint(x: pad, y: y)); p.addLine(to: CGPoint(x: pad + w, y: y))
            ctx.stroke(p, with: .color(Tokens.Colors.line(line)),
                       style: StrokeStyle(lineWidth: Tokens.Map.lineStrokeThin, lineCap: .round, dash: [0.1, Tokens.Map.futureDotSpacing / 2]))
        }
        // Visit caps: dashed, spanning the lines their items sit on.
        for v in model.visits {
            let rows = v.items.compactMap { model.item($0.key)?.line }.compactMap { LineGeometry.row($0) }
            guard let lo = rows.min(), let hi = rows.max() else { continue }
            let vx = x(v.weekOf), half = Tokens.Map.capWidth / 2
            let rect = CGRect(x: vx - half, y: top + CGFloat(lo) * gap - 10, width: half * 2, height: CGFloat(hi - lo) * gap + 20)
            ctx.stroke(Path(roundedRect: rect, cornerRadius: half), with: .color(Tokens.Colors.ink2),
                       style: StrokeStyle(lineWidth: Tokens.Map.capStroke, dash: [4, 3]))
        }
        let r = Tokens.Map.ringRadius
        for ring in rings {
            let kind: MarkKind = ring.date <= model.date ? .overdue : markKind(ring.item.status)
            ctx.statusMark(kind, at: CGPoint(x: min(max(x(ring.date), pad + r), pad + w - r), y: top + CGFloat(ring.row) * gap),
                           radius: r, ringWidth: Tokens.Map.ringStroke)
        }
        // The marker and its handle, with its date.
        var m = Path(); m.move(to: CGPoint(x: mx, y: top - 22)); m.addLine(to: CGPoint(x: mx, y: bottom + 14))
        ctx.stroke(m, with: .color(Tokens.Colors.ink), lineWidth: 2)
        ctx.fill(Path(ellipseIn: CGRect(x: mx - 8, y: bottom + 6, width: 16, height: 16)), with: .color(Tokens.Colors.ink))
        let dateLabel = ctx.resolve(Text(dayDate(model.date, today: model.today)).font(strong).foregroundStyle(Tokens.Colors.ink))
        let lw = dateLabel.measure(in: size).width
        ctx.draw(dateLabel, at: CGPoint(x: min(max(mx, lw / 2), size.width - lw / 2), y: top - 40), anchor: .top)
        let ticks = model.scale.ticks
        for (i, t) in ticks.enumerated() {
            let y = bottom + 28
            switch i {
            case 0: ctx.draw(label(t.text), at: CGPoint(x: pad, y: y), anchor: .topLeading)
            case ticks.count - 1: ctx.draw(label(t.text), at: CGPoint(x: pad + w, y: y), anchor: .topTrailing)
            default:
                // A middle tick that would run into the end label is left out on narrow leaves.
                let l = label(t.text), half = l.measure(in: size).width / 2
                let endWidth = label(ticks[ticks.count - 1].text).measure(in: size).width
                if pad + t.x * w + half + 8 < pad + w - endWidth { ctx.draw(l, at: CGPoint(x: pad + t.x * w, y: y), anchor: .top) }
            }
        }
    }
}

// MARK: One visit (M-STATUS-04)

/// A suggested or booked visit: what rides along, who did each last; book it, change or cancel a booking, or send the
/// list to the shop. Viewers read only.
struct VisitScreen: View {
    let recs: Recs
    let key: String
    @State private var fetched: [VisitView] = []
    @State private var booked: VisitView?
    @State private var booking = false
    @State private var cancelling = false
    @State private var sending = false
    @State private var sendText: String?
    @State private var error: String?
    @State private var openKey: String?

    private var all: [VisitView] { (recs.snapshot?.visits?.all ?? []) + fetched }
    private var visit: VisitView? {
        if let b = booked { return b.id.flatMap { id in findVisit(all, id).map { $0.status == b.status ? $0 : b } } ?? b }
        return findVisit(all, key)
    }
    private var providers: [Rec] { recs.records("service_provider").filter { $0.s("deleted_at") == nil } }

    var body: some View {
        let v = visit
        let today = recs.snapshot?.today ?? todayISO()
        let shop = v?.providerIds.first.flatMap { id in providers.first { $0.id == id }?.s("name") }
        RecScreen(section: .status, title: v.map { "Week of \(dayDate($0.weekOf, today: today))" } ?? "Visit", back: "Back") {
            if let v { content(v, shop: shop, today: today) } else {
                EmptyLine(text: "This visit isn't suggested any more. Its items may have been done or booked.")
            }
        } footer: {
            if let v, recs.canEdit { footer(v, shop: shop) }
        }
        .task {
            if recs.online, let r = try? await recs.api.visits(aircraftId: recs.id) { fetched = r.visits.all }
        }
        .sheet(isPresented: $booking) { if let v { BookSheet(recs: recs, visit: v, providers: providers) { booked = $0 } } }
        .sheet(isPresented: Binding { openKey != nil } set: { if !$0 { openKey = nil } }) { ItemSheet(recs: recs, key: openKey ?? "") }
        .confirmationDialog("Cancel the \(v.map { dayDate($0.weekOf, today: today) } ?? "") visit?", isPresented: $cancelling, titleVisibility: .visible) {
            Button("Cancel the visit", role: .destructive) { if let v { cancel(v, today: today) } }
            Button("Keep it", role: .cancel) {}
        } message: { Text("The items stay on your due list.") }
    }

    @ViewBuilder private func content(_ v: VisitView, shop: String?, today: String) -> some View {
        let items = recs.snapshot?.items ?? []
        HStack(alignment: .top, spacing: Tokens.Space.s3) {
            Lede(visitStatement(v, items)).frame(maxWidth: .infinity, alignment: .leading)
            StatusMark(kind: v.id == nil || v.status == "cancelled" ? .noRecord : .current, label: visitStatusWord(v.id == nil ? "suggested" : v.status), compact: true)
        }
        if let shop { Note("At \(shop)").padding(.top, Tokens.Space.s2) }
        GroupHeader(title: "In this visit", count: "\(v.open.count)")
        ForEach(v.open, id: \.key) { vi in
            if let item = items.first(where: { $0.key == vi.key }) {
                DueRow(item: item, today: today) { openKey = item.key }
                if let line = lastDoneLine(signer: item.lastDone?.signer, date: item.lastDone?.date) {
                    Note(line).padding(.bottom, Tokens.Space.s2)
                }
            }
        }
        if let error { Note(error, alarm: true).padding(.top, Tokens.Space.s2) }
        if !recs.canEdit { Note("You can view this aircraft. The owner or an editor books visits.").padding(.top, Tokens.Space.s3) }
    }

    @ViewBuilder private func footer(_ v: VisitView, shop: String?) -> some View {
        if v.id == nil {
            Button("Book this visit") { booking = true }.buttonStyle(.primary)
        } else if v.status == "planned" {
            if let text = sendText {
                ShareLink(item: text, subject: Text("\(recs.tail), visit the week of \(longDate(v.weekOf))")) {
                    Label { Text(shop.map { "Send the list to \($0)" } ?? "Send the list") } icon: { Icon("send", size: 18) }
                }
                .buttonStyle(.primary)
            } else {
                Button { send(v, shop: shop) } label: {
                    Label { Text(sending ? "Making the link" : shop.map { "Send to \($0)" } ?? "Send to the shop") } icon: { Icon("send", size: 18) }
                }
                .buttonStyle(.secondary)
                .disabled(!recs.online || sending)
                if !recs.online { Note("Sending the list needs signal.") }
            }
            HStack(spacing: Tokens.Space.s2) {
                Button("Cancel the visit") { cancelling = true }.buttonStyle(.quiet)
                Button("Change") { booking = true }.buttonStyle(.secondary)
            }
        }
    }

    private func send(_ v: VisitView, shop: String?) {
        guard let id = v.id else { return }
        sending = true
        error = nil
        Task {
            do {
                let r = try await recs.api.sendVisit(aircraftId: recs.id, visitId: id, recipient: shop ?? "Shop", providerId: v.providerIds.first)
                sendText = visitMessage(tail: recs.tail, owner: nil, v, recs.snapshot?.items ?? [], url: r["url"] as? String ?? "")
            } catch {
                self.error = (error as? RecordsAPI.Failure)?.message ?? "Sending the list needs signal."
            }
            sending = false
        }
    }

    private func cancel(_ v: VisitView, today: String) {
        guard let id = v.id else { return }
        recs.change("visit.setStatus", "planned_visit", id, "Cancel the visit of \(dayDate(v.weekOf, today: today))", ["visitId": id, "status": "cancelled"])
        var c = v
        c.status = "cancelled"
        booked = c
        recs.say("Visit cancelled. Its items are back on your due list.")
    }
}

/// Book this visit / Change (M-STATUS-04): which week, where, then visit.create or visit.update (both queue offline).
private struct BookSheet: View {
    let recs: Recs
    let visit: VisitView
    let providers: [Rec]
    let onBooked: (VisitView) -> Void
    @State private var week: String?
    @State private var shop = ""
    @State private var name = ""
    @State private var kind = "mechanic"
    @Environment(\.dismiss) private var dismiss

    private static let addShop = "+"
    private static let kinds = [("mechanic", "Mechanic"), ("avionics_shop", "Avionics shop"), ("engine_shop", "Engine shop"), ("prop_shop", "Prop shop")]

    var body: some View {
        let change = visit.id != nil
        let adding = shop == Self.addShop
        RecSheet(title: change ? "Change the visit" : "Book this visit", dirty: adding && !name.isEmpty) {
            DateRow(label: "Which week?", date: $week, pastOnly: false)
            Note("Week of \(longDate(mondayOf(week ?? visit.weekOf)))")
            ChoiceRow(label: "Where?", options: [("", "Not decided")] + providers.map { ($0.id, $0.s("name") ?? "") } + [(Self.addShop, "Add a shop")], selection: $shop)
            if adding {
                TextBox(label: "Shop or mechanic", text: $name)
                ChoiceRow(label: "What kind", options: Self.kinds, selection: $kind)
            }
            Button(change ? "Save" : "Book it") { book(change: change, adding: adding) }
                .buttonStyle(.primary)
                .disabled(adding && name.trimmingCharacters(in: .whitespaces).isEmpty)
                .padding(.top, Tokens.Space.s4)
        }
        .onAppear {
            week = visit.visitDate ?? visit.weekOf
            let byKey = Dictionary((recs.snapshot?.items ?? []).map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a })
            shop = visit.providerIds.first ?? visit.items.lazy.compactMap { byKey[$0.key]?.providerId }.first
                ?? providers.first { $0.b("is_default") }?.id ?? ""
        }
    }

    private func book(change: Bool, adding: Bool) {
        let today = recs.snapshot?.today ?? todayISO()
        var providerId: String? = shop.isEmpty || adding ? nil : shop
        var dep: String?
        if adding {
            let id = newId()
            providerId = id
            let n = name.trimmingCharacters(in: .whitespaces)
            dep = recs.change("provider.upsert", "service_provider", id, "Add \(n)", ["id": id, "fields": ["name": n, "kind": kind]])
        }
        let picked = week ?? visit.weekOf
        let monday = mondayOf(picked)
        let day: String? = picked == monday ? nil : picked
        var made = visit
        if change, let id = visit.id {
            recs.change("visit.update", "planned_visit", id, "Change the visit of \(dayDate(visit.weekOf, today: today))",
                        payload(["visitId": id, "weekOf": monday, "visitDate": day, "providerId": providerId]), dependsOn: dep)
        } else {
            let id = newId()
            recs.change("visit.create", "planned_visit", id, "Book the visit of \(dayDate(monday, today: today))",
                        payload(["id": id, "weekOf": monday, "visitDate": day, "providerId": providerId,
                                 "fromSuggestionKey": visit.suggestionKey, "itemKeys": visit.open.map(\.key)]), dependsOn: dep)
            made.id = id
            made.status = "planned"
        }
        made.weekOf = monday
        made.visitDate = day
        made.providerIds = providerId.map { [$0] } ?? []
        onBooked(made)
        recs.say(recs.online ? "Booked." : "Booked on this phone. It uploads when you have signal.")
        dismiss()
    }
}

/// The visits group on Status (09 §3.5): each suggestion or booking as a row, so they are reachable without the line.
struct VisitRows: View {
    let snapshot: StatusSnapshot
    @Environment(\.recNav) private var nav

    var body: some View {
        let all = snapshot.visits?.all ?? []
        if !all.isEmpty {
            GroupHeader(title: "Visits", count: "\(all.count)")
            ForEach(all.map { (visitKey($0), $0) }, id: \.0) { _, v in
                RecRow("Week of \(dayDate(v.weekOf, today: snapshot.today))",
                       lines: [v.open.compactMap { vi in snapshot.items.first { $0.key == vi.key }?.label }.joined(separator: ", ")],
                       action: { nav.open(.visit(visitKey(v))) }) {
                    StatusMark(kind: v.id == nil || v.status == "cancelled" ? .noRecord : .current, label: visitStatusWord(v.id == nil ? "suggested" : v.status), compact: true)
                }
            }
        }
    }
}
