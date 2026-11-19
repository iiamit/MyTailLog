import SwiftUI

/// Pushed Status screens on the phone (06 M-STATUS-05, M-STATUS-08).
enum StatusRoute: Hashable {
    case all
    case item(String)
}

/// M-STATUS-01/02: the phone home, in the Status tab's leaf. Pull to refresh asks the server again.
struct StatusHome: View {
    let model: StatusModel
    @Environment(TabModel.self) private var tabs

    var body: some View {
        PhoneLeaf {
            StatusContent(model: model, mode: .home, open: open)
            StatusCapture(model: model)
        }
        .refreshable { await model.refresh() }
        .navigationDestination(for: StatusRoute.self) { route in
            switch route {
            case .all: StatusAllItems(model: model, open: open)
            case .item(let key): StatusItemScreen(model: model, key: key)
            }
        }
    }

    private func open(_ route: StatusRoute) {
        tabs.paths[.status, default: NavigationPath()].append(route)
    }
}

/// M-STATUS-08: every tracked item by horizon, with the limit's icon.
struct StatusAllItems: View {
    let model: StatusModel
    let open: (StatusRoute) -> Void

    var body: some View {
        let n = model.snapshot?.items.count ?? 0
        PhoneBoard(section: .status, title: n == 1 ? "All 1 item" : "All \(n) items", back: "Status") {
            PhoneLeaf {
                if let snap = model.snapshot {
                    DueGroups(snapshot: snap, mode: .all, open: { open(.item($0)) })
                }
            }
        }
    }
}

/// M-STATUS-05 on the phone: pushed, titled with the item's name.
struct StatusItemScreen: View {
    let model: StatusModel
    let key: String

    var body: some View {
        let item = model.snapshot?.items.first { $0.key == key }
        PhoneBoard(section: .status, title: item?.label ?? "Status", back: "Status") {
            PhoneLeaf {
                if let item, let snap = model.snapshot { ItemDetail(item: item, snapshot: snap, titled: false) }
            }
        }
    }
}

/// T-STATUS-01: the Verdict, line ahead and due list on the left leaf; the selected item on the right.
/// A row selects, it does not navigate.
struct StatusTablet: View {
    let model: StatusModel
    @State private var selected: String?
    /// Plan ahead (T-STATUS-02) and a visit replace the two leaves; back pops them.
    @State private var stack: [RecRoute] = []
    @Environment(TabModel.self) private var tabs
    @Environment(Recs.self) private var recs: Recs?

    var body: some View {
        if let recs, let route = stack.last {
            RecordScreen(recs: recs, route: route).id(route)
                .environment(\.recNav, RecNav(open: { stack.append($0) }, back: { _ = stack.popLast() }, tablet: true))
                .onChange(of: recs.id) { stack = [] }
        } else {
            leaves.environment(\.recNav, RecNav(open: { stack.append($0) }, back: {}, tablet: true))
        }
    }

    private var leaves: some View {
        HStack(spacing: Tokens.Space.s4) {
            TabletLeaf {
                StatusContent(model: model, mode: .tablet, selected: selected) { route in
                    if case .item(let key) = route { selected = key }
                }
            }
            .refreshable { await model.refresh() }
            TabletLeaf {
                let items = model.snapshot?.items ?? []
                if let snap = model.snapshot, let item = items.first(where: { $0.key == selected }) ?? items.first {
                    ItemDetail(item: item, snapshot: snap)
                }
            }
            // The list leads; the selected item's leaf stays narrower so rows keep their two columns in portrait.
            .frame(maxWidth: 380)
        }
    }
}

/// A tablet leaf: the white surface, radius.s, its content scrolling (02 §9.1).
struct TabletLeaf<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Space.s4) { content }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 26)
                .padding(.horizontal, 30)
                .padding(.bottom, Tokens.Space.s8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Tokens.Colors.leaf, in: RoundedRectangle(cornerRadius: Tokens.Radius.s))
    }
}

enum StatusMode { case home, all, tablet }

/// The home's content: states, Verdict, line ahead, groups and the closing lines (06 M-STATUS-01, 02).
struct StatusContent: View {
    let model: StatusModel
    let mode: StatusMode
    var selected: String?
    let open: (StatusRoute) -> Void
    @Environment(TabModel.self) private var tabs
    @Environment(\.recNav) private var nav
    @Environment(Recs.self) private var recs: Recs?

    var body: some View {
        if let snap = model.snapshot {
            loaded(snap)
        } else if model.failed {
            StatusError(retry: retry)
        } else if model.noAircraft {
            Text(Section.status.emptyLine).dFont(.body).foregroundStyle(Tokens.Colors.ink)
        } else {
            StatusLoading()
        }
    }

    @ViewBuilder
    private func loaded(_ snap: StatusSnapshot) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s2) {
            if snap.nothingTracked {
                Verdict(text: "Nothing is tracked yet. Set up the standard inspections to see what's due.",
                        emphasis: [[0, "Nothing is tracked yet.".utf16.count]])
            } else {
                Verdict(text: snap.verdict.text, emphasis: snap.verdict.emphasis)
            }
            ForEach(snap.verdict.lines, id: \.self) { Small($0) }
            if snap.nothingTracked { Small("Scan the logbooks so we can find when they were last done.") }
            if let fresh = snap.freshness() { Small(fresh) }
            if model.failed { StatusError(retry: retry, compact: true) }
        }
        if snap.situation != "setup" && !snap.items.isEmpty {
            VStack(alignment: .leading, spacing: Tokens.Space.s1) {
                LineAheadView(snapshot: snap, plan: recs == nil ? nil : { nav.open(.plan) }) { open(.item($0)) }
                ForEach(snap.undatedLines, id: \.self) { Small($0) }
                if recs != nil { PhoneRow(title: "Plan ahead") { nav.open(.plan) } }
            }
        }
        VStack(alignment: .leading, spacing: 0) {
            if snap.counts.pagesToReview > 0 && mode != .tablet {
                let n = snap.counts.pagesToReview
                PhoneRow(title: n == 1 ? "1 page waits for review." : "\(n) pages wait for review.") { tabs.selected = .books }
            }
            if snap.situation == "all_clear" && mode == .home {
                GroupHeader(title: "Coming up", count: "\(snap.items.count) tracked")
                ForEach(snap.items.prefix(3)) { item in
                    DueRow(item: item, today: snap.today) { open(.item(item.key)) }
                }
                if let line = snap.meterLine { Small(line).padding(.top, Tokens.Space.s3) }
            } else {
                DueGroups(snapshot: snap, mode: mode, selected: selected) { open(.item($0)) }
            }
            if mode == .home && snap.items.count > snap.shownOnHome {
                let n = snap.items.count
                PhoneRow(title: n == 1 ? "See all 1 item" : "See all \(n) items") { open(.all) }
            }
            if recs != nil { VisitRows(snapshot: snap) }
        }
        VStack(alignment: .leading, spacing: Tokens.Space.s2) {
            Small("Worked out from your confirmed entries. The paper logbooks are the record.")
            if let a = model.current, a.role == .viewer {
                Small(a.isDemo ? "This is the demo aircraft. Add your own from the hangar."
                      : "You can view \(a.tailNumber). The owner can make changes.")
            }
        }
        .padding(.top, Tokens.Space.s2)
    }

    private func retry() { Task { await model.refresh() } }
}

/// The groups in order, each with its rows; on the home, Later shows only its first row (06 M-STATUS-01).
struct DueGroups: View {
    let snapshot: StatusSnapshot
    let mode: StatusMode
    var selected: String?
    let open: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(snapshot.grouped, id: \.group) { entry in
                GroupHeader(title: entry.group.title, count: entry.group == .later ? "\(entry.items.count)" : nil)
                ForEach(entry.group == .later && mode == .home ? Array(entry.items.prefix(1)) : entry.items) { item in
                    DueRow(item: item, today: snapshot.today, showLimitIcon: mode == .all, selected: item.key == selected) {
                        open(item.key)
                    }
                }
            }
        }
    }
}

private struct Small: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).dFont(.small).foregroundStyle(Tokens.Colors.ink3).fixedSize(horizontal: false, vertical: true)
    }
}

/// 06 §1.6 loading: the shape of the content in leaf-2 blocks, no spinner, no animation.
private struct StatusLoading: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s2) {
            Skeleton(fraction: 0.9, height: 22)
            Skeleton(fraction: 0.55, height: 22)
            Skeleton(fraction: 1, height: 168).padding(.vertical, Tokens.Space.s4)
            ForEach(0..<4) { Skeleton(fraction: $0 % 2 == 0 ? 0.7 : 0.5, height: 40) }
        }
        .accessibilityElement()
        .accessibilityLabel("Loading status")
    }
}

/// Verdict error state (02 §5.1): the sentence in lede ink-2 and a quiet Retry.
private struct StatusError: View {
    let retry: () -> Void
    var compact = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("We could not work out what is due right now.")
                .dFont(compact ? .small : .lede)
                .foregroundStyle(Tokens.Colors.ink2)
                .fixedSize(horizontal: false, vertical: true)
            Button("Retry", action: retry).buttonStyle(.quiet)
        }
    }
}

/// Phone DueRow (02 §5.8, 06 M-STATUS-01): name and meta on the left, what is left over the StatusMark on the right.
/// At accessibility sizes the two columns stack (11 §2).
struct DueRow: View {
    let item: DueItem
    let today: String
    var showLimitIcon = false
    var selected = false
    let action: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let stacked = typeSize.isAccessibilitySize
        let layout = stacked ? AnyLayout(VStackLayout(alignment: .leading, spacing: Tokens.Space.s2))
            : AnyLayout(HStackLayout(alignment: .top, spacing: Tokens.Space.s3))
        Button(action: action) {
            layout {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.label).dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink)
                    DueMeta(item: item, today: today, showLimitIcon: showLimitIcon)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: stacked ? .leading : .trailing, spacing: 2) {
                    if let slip = item.overdueText {
                        StatusMark(kind: .overdue, label: slip, compact: true)
                    } else {
                        if let value = item.rowValue { Text(value).dFont(.small, weight: 700).foregroundStyle(Tokens.Colors.ink) }
                        StatusMark(kind: markKind(item.status), label: statusWord(item.status), compact: true)
                    }
                }
            }
            .padding(.vertical, Tokens.Space.s3)
            .frame(minHeight: Tokens.Size.phoneRowMin)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowButtonStyle(selected: selected))
        .overlay(alignment: .bottom) { Rule() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(item.spoken(today: today))
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
    }
}

private struct DueMeta: View {
    let item: DueItem
    let today: String
    let showLimitIcon: Bool

    var body: some View {
        FlowLayout {
            let parts = metaParts
            ForEach(parts.indices, id: \.self) { i in
                if i > 0 { Text("·").dFont(.small).foregroundStyle(Tokens.Colors.ink3) }
                parts[i]
            }
        }
    }

    private var metaParts: [AnyView] {
        var parts: [AnyView] = []
        if let name = bookName(item.line) { parts.append(AnyView(LineChip(line: item.line, label: name))) }
        for limit in item.limits(today: today) {
            parts.append(AnyView(HStack(spacing: 4) {
                if showLimitIcon {
                    Icon(limit.kind == .hours ? "gauge" : limit.kind == .document ? "file-text" : "calendar", size: 14)
                        .foregroundStyle(Tokens.Colors.ink3)
                }
                Text(limit.text + (limit.about.map { " · \($0)" } ?? "")).dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                if limit.first { FirstBadge() }
            }))
        }
        for q in item.qualifiers { parts.append(AnyView(Text(q).dFont(.small).foregroundStyle(Tokens.Colors.ink3))) }
        if let done = item.lastDone { parts.append(AnyView(PageCite(label: done.pageLabel))) }
        return parts
    }
}

/// Wraps its children onto lines, left to right; each line's children centred on each other.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6
    var lineSpacing: CGFloat = 2

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrange(proposal.width ?? .infinity, subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for (view, frame) in zip(subviews, arrange(bounds.width, subviews).frames) {
            view.place(at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY),
                       proposal: ProposedViewSize(frame.size))
        }
    }

    private func arrange(_ width: CGFloat, _ subviews: Subviews) -> (size: CGSize, frames: [CGRect]) {
        var frames: [CGRect] = [], line: [Int] = []
        var x: CGFloat = 0, y: CGFloat = 0, lineHeight: CGFloat = 0, maxX: CGFloat = 0
        func closeLine() {
            for i in line { frames[i].origin.y = y + (lineHeight - frames[i].height) / 2 }
            y += lineHeight + lineSpacing
            x = 0; lineHeight = 0; line = []
        }
        for view in subviews {
            let size = view.sizeThatFits(ProposedViewSize(width: width, height: nil))
            if x > 0 && x + size.width > width { closeLine() }
            frames.append(CGRect(origin: CGPoint(x: x, y: 0), size: size))
            line.append(frames.count - 1)
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
            maxX = max(maxX, x - spacing)
        }
        if !line.isEmpty { closeLine() }
        return (CGSize(width: maxX, height: max(0, y - lineSpacing)), frames)
    }
}

/// M-STATUS-05 item detail: the rule, its limits (both, the first named), the last completion and the page that says so.
/// shortcut: no SourceMat crop, history line or Mark done until Logbooks (phase 2) and capture (phase 3).
struct ItemDetail: View {
    let item: DueItem
    let snapshot: StatusSnapshot
    /// The phone's pushed screen already names the item in its header; the tablet's right leaf does not.
    var titled = true

    var body: some View {
        let both = item.calendar != nil && item.hours != nil
        VStack(alignment: .leading, spacing: 2) {
            HStack(alignment: .firstTextBaseline, spacing: Tokens.Space.s3) {
                if titled {
                    Text(item.label).dFont(.heading).foregroundStyle(Tokens.Colors.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityAddTraits(.isHeader)
                }
                StatusMark(kind: markKind(item.status), label: item.overdueText ?? statusWord(item.status))
            }
            Text(([item.rule] + item.qualifiers).joined(separator: " · ")).dFont(.small).foregroundStyle(Tokens.Colors.ink3)
                .padding(.bottom, Tokens.Space.s3)
            if let due = item.calendarDue { KeyValue(key: "Due", value: due, first: both && item.first == "calendar") }
            if let due = item.hoursDue { KeyValue(key: "Due", value: due, first: both && item.first == "hours") }
            if let about = item.projection(rate: snapshot.rate, today: snapshot.today) { KeyValue(key: "About", value: about) }
            if let done = item.lastDoneText { KeyValue(key: "Last done", value: done) }
            if let signer = item.lastDone?.signer { KeyValue(key: "Usually", value: signer) }
            Text("The page that says so").dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink)
                .accessibilityAddTraits(.isHeader)
                .padding(.top, Tokens.Space.s5)
            if let done = item.lastDone {
                let level = trustLevel(done.trust, signer: done.signer)
                FlowLayout(spacing: Tokens.Space.s3) {
                    TrustMark(level: level, label: trustWords(level, signer: done.signer))
                    PageCite(label: done.pageLabel)
                }
            } else {
                Text("No page shows this being done yet.").dFont(.body).foregroundStyle(Tokens.Colors.ink2)
            }
            if item.waitingEntryId != nil {
                TrustMark(level: .aiRead, label: "A newer entry is waiting for review. The due date does not move until you confirm it.")
                    .padding(.top, Tokens.Space.s2)
            }
        }
        .environment(\.section, .status)
    }
}

/// KeyValueList row (02 §5): key ink-3 at a fixed width, the value in ink; stacked at accessibility sizes.
private struct KeyValue: View {
    let key: String
    let value: String
    var first = false
    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric private var keyWidth: CGFloat = 88

    var body: some View {
        let stacked = typeSize.isAccessibilitySize
        let layout = stacked ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: Tokens.Space.s3))
        layout {
            Text(key).dFont(.small).foregroundStyle(Tokens.Colors.ink3).frame(width: stacked ? nil : keyWidth, alignment: .leading)
            HStack(alignment: .firstTextBaseline, spacing: Tokens.Space.s2) {
                Text(value).dFont(.body).foregroundStyle(Tokens.Colors.ink).fixedSize(horizontal: false, vertical: true)
                if first { FirstBadge() }
            }
        }
        .frame(minHeight: 32, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}
