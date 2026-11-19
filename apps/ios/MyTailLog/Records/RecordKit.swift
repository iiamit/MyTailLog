import SwiftUI

// The small kit phase 4's screens share (02 §6 forms, §8 feedback; port of Android's Kit.kt record pieces):
// boards and leaves that work on the phone and in the tablet's right leaf, rows that carry their sync state,
// form fields, sheets that ask before discarding, and the toast.

/// A record screen's leaf: the phone's PhoneLeaf, or the tablet's leaf; a pinned footer for the screen's buttons.
struct RecLeaf<Content: View, Footer: View>: View {
    @ViewBuilder var content: Content
    @ViewBuilder var footer: Footer
    @Environment(\.recNav) private var nav
    @Environment(Recs.self) private var recs: Recs?

    var body: some View {
        Group {
            if nav.tablet {
                TabletLeaf { VStack(alignment: .leading, spacing: 0) { content } }
            } else {
                PhoneLeaf { VStack(alignment: .leading, spacing: 0) { content } }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: Tokens.Space.s2) {
                if let recs { ToastBar(recs: recs) }
                footerBar
            }
        }
    }

    @ViewBuilder private var footerBar: some View {
        let f = footer
        if !(f is EmptyView) {
            VStack(spacing: Tokens.Space.s2) { f }
                .padding(.horizontal, Tokens.Space.s4)
                .padding(.vertical, Tokens.Space.s3)
                .background(Tokens.Colors.leaf)
                .overlay(alignment: .top) { Rule() }
                .padding(.horizontal, nav.tablet ? 0 : Tokens.Space.s2)
        }
    }
}

extension RecLeaf where Footer == EmptyView {
    init(@ViewBuilder content: () -> Content) { self.init(content: content, footer: { EmptyView() }) }
}

/// A pushed record screen: on the phone a PhoneBoard with the back control; in the tablet's right leaf a back row and
/// the title over the leaf.
struct RecScreen<Content: View, Footer: View>: View {
    let section: Section
    let title: String
    let back: String
    @ViewBuilder var content: Content
    @ViewBuilder var footer: Footer
    @Environment(\.recNav) private var nav

    var body: some View {
        if nav.tablet {
            VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                Button { nav.back() } label: {
                    HStack(spacing: 2) { Icon("chevron-left"); Text(back).dFont(.bodyStrong, weight: 600) }
                        .foregroundStyle(section.onBoard).frame(minHeight: Tokens.Size.phoneTouchMin).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Back to \(back)")
                Text(title).dFont(.heading).foregroundStyle(section.onBoard).lineLimit(2).accessibilityAddTraits(.isHeader)
                RecLeaf(content: { content }, footer: { footer })
            }
            .environment(\.section, section)
        } else {
            PhoneBoard(section: section, title: title, back: back) {
                RecLeaf(content: { content }, footer: { footer })
            }
        }
    }
}

extension RecScreen where Footer == EmptyView {
    init(section: Section, title: String, back: String, @ViewBuilder content: () -> Content) {
        self.init(section: section, title: title, back: back, content: content, footer: { EmptyView() })
    }
}

/// The toast (02 §8.4): ink bar, leaf text, an optional action; it goes after 4 s (8 s with an action).
struct ToastBar: View {
    let recs: Recs

    var body: some View {
        if let t = recs.toast {
            HStack {
                Text(t.text).dFont(.small, weight: 700).foregroundStyle(Tokens.Colors.leaf).fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: Tokens.Space.s2)
                if let action = t.action, let run = t.run {
                    Button(action) { run(); recs.toast = nil }
                        .dFont(.small, weight: 700).foregroundStyle(Tokens.Colors.leaf).frame(minHeight: Tokens.Size.phoneTouchMin)
                }
            }
            .padding(.horizontal, Tokens.Space.s4)
            .frame(minHeight: Tokens.Size.phoneTouchMin)
            .background(Tokens.Colors.ink, in: RoundedRectangle(cornerRadius: Tokens.Radius.m))
            .padding(.horizontal, Tokens.Space.s4)
            .accessibilityElement(children: .contain)
            .task(id: t.id) {
                UIAccessibility.post(notification: .announcement, argument: t.text)
                try? await Task.sleep(for: .seconds(t.action == nil ? 4 : 8))
                if recs.toast?.id == t.id { recs.toast = nil }
            }
        }
    }
}

/// type.small ink-3, or alarm text.
struct Note: View {
    let text: String
    var alarm = false
    init(_ text: String, alarm: Bool = false) { self.text = text; self.alarm = alarm }
    var body: some View {
        Text(text).dFont(.small).foregroundStyle(alarm ? Tokens.Colors.alarmText : Tokens.Colors.ink3).fixedSize(horizontal: false, vertical: true)
    }
}

/// type.body ink.
struct Lede: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View { Text(text).dFont(.body).foregroundStyle(Tokens.Colors.ink).fixedSize(horizontal: false, vertical: true) }
}

/// An empty state: one sentence, and the action that fills it.
struct EmptyLine: View {
    let text: String
    var action: String?
    var run: (() -> Void)?
    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            Lede(text)
            if let action, let run { Button(action, action: run).buttonStyle(.secondary) }
        }
        .padding(.vertical, Tokens.Space.s3)
    }
}

/// A tinted well: leaf-2, or alarm-bg for a soft alarm.
struct Well<Content: View>: View {
    var alarm = false
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s2) { content }
            .foregroundStyle(alarm ? Tokens.Colors.onAlarmBg : Tokens.Colors.ink)
            .padding(Tokens.Space.s3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(alarm ? Tokens.Colors.alarmBg : Tokens.Colors.leaf2, in: RoundedRectangle(cornerRadius: Tokens.Radius.m))
            .padding(.vertical, Tokens.Space.s2)
    }
}

/// "On this phone", "Not saved: …" or "Changed in two places" under a record (06 §1.4).
struct PendingCaption: View {
    let rec: Rec
    var body: some View {
        if let r = rec.refused {
            Text("Not saved: \(r)").dFont(.small, weight: 600).foregroundStyle(Tokens.Colors.alarmText)
        } else if rec.conflict {
            Text("Changed in two places. Compare under Waiting to upload.").dFont(.small, weight: 600).foregroundStyle(Tokens.Colors.alarmText)
        } else if rec.pending {
            Label { Text("On this phone") } icon: { Icon("cloud-upload", size: 14) }
                .dFont(.small).foregroundStyle(Tokens.Colors.ink3)
        }
    }
}

/// One menu entry on a row (the long-press menu, 06 §1.6).
struct RowAction: Identifiable {
    let title: String
    var role: ButtonRole?
    let run: () -> Void
    var id: String { title }
}

/// A record row (58+ tall): title, sublines, the row's sync state, something trailing, and anything below.
struct RecRow<Trailing: View, Below: View>: View {
    let title: String
    var lines: [String] = []
    var rec: Rec?
    var action: (() -> Void)?
    var menu: [RowAction] = []
    @ViewBuilder var trailing: Trailing
    @ViewBuilder var below: Below

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s2) {
            Group {
                if let action {
                    Button(action: action) { head(chevron: Trailing.self == EmptyView.self) }.buttonStyle(RowButtonStyle())
                } else {
                    head(chevron: false)
                }
            }
            .contextMenu {
                ForEach(menu) { m in Button(m.title, role: m.role, action: m.run) }
            }
            .accessibilityActions { ForEach(menu) { m in Button(m.title, action: m.run) } }
            below
        }
        .padding(.bottom, Below.self == EmptyView.self ? 0 : Tokens.Space.s3)
        .overlay(alignment: .bottom) { Rule() }
    }

    private func head(chevron: Bool) -> some View {
        HStack(alignment: .center, spacing: Tokens.Space.s3) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink).fixedSize(horizontal: false, vertical: true)
                ForEach(Array(lines.enumerated()), id: \.offset) { _, l in Note(l) }
                if let rec { PendingCaption(rec: rec) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            trailing
            if chevron { Icon("chevron-right").foregroundStyle(Tokens.Colors.ink3) }
        }
        .padding(.vertical, Tokens.Space.s3)
        .frame(minHeight: Tokens.Size.phoneRowMin)
        .contentShape(Rectangle())
    }
}

extension RecRow where Trailing == EmptyView, Below == EmptyView {
    init(_ title: String, lines: [String] = [], rec: Rec? = nil, action: (() -> Void)? = nil, menu: [RowAction] = []) {
        self.init(title: title, lines: lines, rec: rec, action: action, menu: menu, trailing: { EmptyView() }, below: { EmptyView() })
    }
}

extension RecRow where Below == EmptyView {
    init(_ title: String, lines: [String] = [], rec: Rec? = nil, action: (() -> Void)? = nil, menu: [RowAction] = [],
         @ViewBuilder trailing: () -> Trailing) {
        self.init(title: title, lines: lines, rec: rec, action: action, menu: menu, trailing: trailing, below: { EmptyView() })
    }
}

/// A labelled text field (02 §6.1): label above, 44+ tall, control border; numbers get the decimal pad.
struct TextBox: View {
    let label: String
    @Binding var text: String
    var lines = 1
    var number = false
    var placeholder: String?
    var disabled = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).dFont(.small, weight: 700).foregroundStyle(Tokens.Colors.ink2)
            Group {
                if lines > 1 {
                    TextField(label, text: $text, prompt: placeholder.map { Text($0).foregroundStyle(Tokens.Colors.ink3) }, axis: .vertical)
                        .lineLimit(lines...max(lines, 8))
                } else {
                    TextField(label, text: $text, prompt: placeholder.map { Text($0).foregroundStyle(Tokens.Colors.ink3) })
                        .keyboardType(number ? .decimalPad : .default)
                        .monospacedDigit()
                }
            }
            .labelsHidden()
            .dFont(.body)
            .foregroundStyle(Tokens.Colors.ink)
            .disabled(disabled)
            .padding(.horizontal, Tokens.Space.s3)
            .padding(.vertical, 10)
            .frame(minHeight: Tokens.Size.input + 4)
            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.m).strokeBorder(Tokens.Colors.controlBorder, lineWidth: 1))
            .accessibilityLabel(label)
        }
        .padding(.vertical, Tokens.Space.s2)
    }
}

/// A date as the engine writes it ("2026-11-19"), past only by default; clearable shows "Not set".
struct DateRow: View {
    let label: String
    @Binding var date: String?
    var pastOnly = true
    var clearable = false

    var body: some View {
        HStack(spacing: Tokens.Space.s2) {
            Text(label).dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink)
            Spacer(minLength: Tokens.Space.s2)
            if let d = date {
                let binding = Binding<Date> { Day.date(d) } set: { date = Day.string($0) }
                Group {
                    if pastOnly { DatePicker(label, selection: binding, in: ...Date(), displayedComponents: .date) }
                    else { DatePicker(label, selection: binding, displayedComponents: .date) }
                }
                .labelsHidden()
                .environment(\.timeZone, TimeZone(identifier: "UTC")!)
                if clearable {
                    Button { date = nil } label: { Icon("x", size: 16).frame(width: 44, height: 44) }
                        .foregroundStyle(Tokens.Colors.ink3).accessibilityLabel("Clear \(label)")
                }
            } else {
                Text("Not set").dFont(.body).foregroundStyle(Tokens.Colors.ink3)
                Button("Set") { date = todayISO() }.dFont(.bodyStrong).frame(minHeight: 44)
            }
        }
        .frame(minHeight: Tokens.Size.phoneRowMin)
    }
}

/// A choice among a few named options, as a menu row.
struct ChoiceRow: View {
    let label: String
    let options: [(String, String)]
    @Binding var selection: String

    var body: some View {
        HStack {
            Text(label).dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink)
            Spacer(minLength: Tokens.Space.s2)
            Picker(label, selection: $selection) {
                ForEach(options, id: \.0) { Text($0.1).tag($0.0) }
            }
            .pickerStyle(.menu)
            .tint(Tokens.Colors.ink)
        }
        .frame(minHeight: Tokens.Size.phoneRowMin)
    }
}

/// The segmented control (02 §6.4).
struct Segments: View {
    let label: String
    let options: [String]
    @Binding var selection: Int

    var body: some View {
        Picker(label, selection: $selection) {
            ForEach(Array(options.enumerated()), id: \.offset) { i, o in Text(o).tag(i) }
        }
        .pickerStyle(.segmented)
        .padding(.vertical, Tokens.Space.s2)
    }
}

/// Radio rows with a meaning under each name (the SeverityPicker, 02 §6.6). Nothing selected is allowed.
struct RadioRows: View {
    let label: String
    let options: [(String, String)]
    @Binding var selection: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(options.enumerated()), id: \.offset) { i, o in
                Button { selection = i } label: {
                    HStack(spacing: Tokens.Space.s3) {
                        ZStack {
                            Circle().strokeBorder(Tokens.Colors.controlBorder, lineWidth: 2).frame(width: 22, height: 22)
                            if selection == i { Circle().fill(Tokens.Colors.ink).frame(width: 12, height: 12) }
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(o.0).dFont(.bodyStrong).foregroundStyle(Tokens.Colors.ink)
                            Note(o.1)
                        }
                        Spacer(minLength: 0)
                    }
                    .frame(minHeight: Tokens.Size.phoneRowMin)
                    .contentShape(Rectangle())
                }
                .buttonStyle(RowButtonStyle())
                .accessibilityLabel("\(o.0), \(o.1)")
                .accessibilityAddTraits(selection == i ? [.isSelected] : [])
                .overlay(alignment: .bottom) { Rule() }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }
}

/// A switch row.
struct SwitchRow: View {
    let label: String
    @Binding var on: Bool
    var body: some View {
        Toggle(isOn: $on) { Text(label).dFont(.body).foregroundStyle(Tokens.Colors.ink) }
            .tint(Tokens.Colors.ink)
            .frame(minHeight: Tokens.Size.phoneRowMin)
    }
}

/// A sheet's frame: title, Cancel, a scrolling leaf; with unsaved words it asks before discarding (12 §8).
struct RecSheet<Content: View>: View {
    let title: String
    var dirty = false
    var discardWhat = "change"
    @ViewBuilder var content: Content
    @Environment(\.dismiss) private var dismiss
    @State private var asking = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) { content }
                    .padding(.horizontal, Tokens.Space.s4)
                    .padding(.bottom, Tokens.Space.s6)
            }
            .background(Tokens.Colors.leaf)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { if dirty { asking = true } else { dismiss() } } }
            }
            .confirmationDialog("Discard this \(discardWhat)?", isPresented: $asking, titleVisibility: .visible) {
                Button("Discard", role: .destructive) { dismiss() }
                Button("Keep editing", role: .cancel) {}
            }
        }
        .interactiveDismissDisabled(dirty)
        .presentationBackground(Tokens.Colors.leaf)
    }
}

/// An entry picker as a choice row: the newest entries first, with "Not in the logbook yet".
struct EntryChoice: View {
    let recs: Recs
    let label: String
    @Binding var selected: String?
    var allowNone = "Not in the logbook yet"
    @State private var picking = false
    @State private var query = ""

    var body: some View {
        RecRow(label, lines: [selected.flatMap { recs.entryLine($0) } ?? allowNone], action: { picking = true })
            .sheet(isPresented: $picking) {
                let all = recs.entries()
                RecSheet(title: label) {
                    TextBox(label: "Search", text: $query)
                    RecRow(allowNone, action: { selected = nil; picking = false })
                    ForEach(all.filter { query.isEmpty || $0.line.localizedCaseInsensitiveContains(query) }.prefix(80), id: \.id) { e in
                        RecRow(e.line, action: { selected = e.id; picking = false })
                    }
                    if all.isEmpty { Note("No logbook entries on this phone yet.").padding(.top, Tokens.Space.s3) }
                }
                .presentationDetents([.large])
            }
    }
}

/// A 40×40 tile in a section's colour (the Add sheet's rows, 06 M-FLIGHT-01).
struct SectionTile: View {
    let section: Section
    let icon: String
    var body: some View {
        Icon(icon, size: 22).foregroundStyle(section.onBoard)
            .frame(width: 40, height: 40)
            .background(section.board, in: RoundedRectangle(cornerRadius: Tokens.Radius.m))
    }
}

/// Copy to the pasteboard with a toast.
@MainActor func copyText(_ s: String, _ recs: Recs) {
    UIPasteboard.general.string = s
    recs.say("Copied.")
}
