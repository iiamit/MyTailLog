import SwiftUI

/// The tail line's aircraft and sync state (06 §1.3), from the core.
struct AircraftLine: Equatable {
    var tail: String?
    var lastSync: Date?

    var tailText: String { tail ?? "No aircraft yet" }

    var syncText: String {
        guard let lastSync else { return "not synced yet" }
        let calendar = Calendar.current
        if calendar.isDateInToday(lastSync) { return "synced \(lastSync.formatted(date: .omitted, time: .shortened))" }
        if calendar.isDateInYesterday(lastSync) { return "synced yesterday \(lastSync.formatted(date: .omitted, time: .shortened))" }
        return "synced \(lastSync.formatted(.dateTime.month(.abbreviated).day()))"
    }
}

extension EnvironmentValues {
    @Entry var aircraftLine = AircraftLine()
}

/// PhoneHeader, top-level variant (02 §9.1): the board colour, the tail line, the board title.
/// Does not collapse on scroll (02 §9.1 Decision: the colour is the place marker).
struct PhoneHeader: View {
    @Environment(\.section) private var section
    @Environment(\.aircraftLine) private var line

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s1) {
            AccountButton {
                HStack(spacing: Tokens.Space.s1) {
                    Text(line.tailText).dFont(.small).fontWeight(.semibold).lineLimit(1).layoutPriority(1)
                    Icon("chevron-down", size: 16)
                    Text("· \(line.syncText)").dFont(.small).lineLimit(1)
                }
                .foregroundStyle(section.onBoard2)
                .frame(minHeight: Tokens.Size.phoneTouchMin)
                .contentShape(Rectangle())
            }
            Text(section.title)
                .dFont(.boardTitle)
                .foregroundStyle(section.onBoard)
                .lineLimit(2)
                .accessibilityAddTraits(.isHeader)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, Tokens.Space.s2)
        .padding(.horizontal, Tokens.Space.s4)
        .padding(.bottom, Tokens.Space.s4)
    }
}

/// PhoneLeaf (02 §9.5): the white work surface inset 8 from the edges, top corners radius.s; its content scrolls.
struct PhoneLeaf<Content: View>: View {
    @Environment(\.section) private var section
    @Environment(TabModel.self) private var tabs
    @ViewBuilder var content: Content

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: Tokens.Space.s4) { content }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, Tokens.Space.s5)
                    .padding(.horizontal, Tokens.Space.s4)
                    .padding(.bottom, Tokens.Space.s8)
                    .id("top")
            }
            .onChange(of: tabs.scrollToTop[section]) { proxy.scrollTo("top", anchor: .top) }
        }
        .background(Tokens.Colors.leaf)
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: Tokens.Radius.s, topTrailingRadius: Tokens.Radius.s))
        .padding(.horizontal, Tokens.Space.s2)
    }
}

/// PhoneTabBar (02 §9.4): five coloured tabs hanging from the cover; the open one rises 8 into the leaf.
struct PhoneTabBar: View {
    @Environment(TabModel.self) private var tabs
    @Environment(\.dynamicTypeSize) private var typeSize

    /// Labels hide and the bar grows to 56 at accessibility sizes; long-press shows the Large Content Viewer (05 §19).
    private var height: CGFloat { typeSize.isAccessibilitySize ? 56 : Tokens.Size.phoneTabbar }

    var body: some View {
        HStack(alignment: .top, spacing: Tokens.Space.s1) {
            ForEach(Array(Section.phoneTabs.enumerated()), id: \.element) { index, section in
                tab(section, index: index)
            }
        }
        .padding(.horizontal, Tokens.Space.s2)
        .frame(height: height, alignment: .top)
        .frame(maxWidth: .infinity)
        .background(Tokens.Colors.cover, ignoresSafeAreaEdges: .bottom)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isTabBar)
        .sensoryFeedback(.selection, trigger: tabs.selected)
    }

    private func tab(_ section: Section, index: Int) -> some View {
        let selected = tabs.selected == section
        let shape = UnevenRoundedRectangle(topLeadingRadius: selected ? Tokens.Radius.l : 0,
                                           bottomLeadingRadius: Tokens.Radius.l,
                                           bottomTrailingRadius: Tokens.Radius.l,
                                           topTrailingRadius: selected ? Tokens.Radius.l : 0)
        return Button { tabs.tap(section) } label: {
            VStack(spacing: 3) {
                Icon(section.icon, size: 21)
                if !typeSize.isAccessibilitySize {
                    Text(section.tabLabel).dFont(.tabLabel).lineLimit(1).minimumScaleFactor(0.8)
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: selected ? height + 8 : height)
        }
        .buttonStyle(FillButtonStyle(fill: section.board, content: section.onBoard, shape: shape))
        .opacity(selected ? 1 : 0.92)
        .offset(y: selected ? -8 : 0)
        .accessibilityLabel("\(section.title), tab \(index + 1) of \(Section.phoneTabs.count)")
        .accessibilityAddTraits(selected ? [.isSelected] : [])
        .accessibilityShowsLargeContentViewer {
            Icon(section.icon, size: 21)
            Text(section.tabLabel)
        }
    }
}

/// A filled control with D's pressed layer: 14% of the content colour, no scale (02 §2.3).
struct FillButtonStyle<S: Shape>: ButtonStyle {
    let fill: Color
    let content: Color
    let shape: S

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(content)
            .background(fill)
            .overlay(content.opacity(configuration.isPressed ? 0.14 : 0))
            .clipShape(shape)
            .contentShape(shape)
    }
}

/// The tail line and the rail's Account button. Phase 0 has no aircraft switcher (M-SWITCH-01) yet,
/// so this offers the one account action that exists: sign out (05 §8.6, nothing-unsent path).
struct AccountButton<Label: View>: View {
    @Environment(SessionStore.self) private var store
    @ViewBuilder var label: Label
    @State private var confirming = false

    var body: some View {
        Button { confirming = true } label: { label }
            .buttonStyle(.plain)
            .accessibilityHint("Account")
            .confirmationDialog("Sign out of MyTailLog on this phone? The records stay on the server.",
                                isPresented: $confirming, titleVisibility: .visible) {
                Button("Sign out") { Task { await store.signOut() } }
                Button("Cancel", role: .cancel) {}
            }
    }
}
