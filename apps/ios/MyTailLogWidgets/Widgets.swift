import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

// The widgets (05 §11, 02 §9.14) and the "Pages in progress" Live Activity (05 §12). They read the snapshot the app
// saves in the App Group and never call the network. Each widget is a leaf, so the inks hold in light and dark;
// status is a mark plus a word, never colour alone.

@main
struct MyTailLogWidgets: WidgetBundle {
    var body: some Widget {
        LineAheadWidget()
        NextItemWidget()
        ReadingLiveActivity()
    }
}

// MARK: Timeline

struct StatusEntry: TimelineEntry {
    let date: Date
    let view: WidgetView
}

struct StatusProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> StatusEntry { StatusEntry(date: .now, view: Self.sample) }

    func snapshot(for configuration: PickAircraftIntent, in context: Context) async -> StatusEntry {
        context.isPreview && SharedSnapshots.aircraft().isEmpty ? placeholder(in: context) : entry(configuration, .now)
    }

    /// Now, then each local midnight for 7 days (day counts change at midnight); the app reloads on every new snapshot.
    func timeline(for configuration: PickAircraftIntent, in context: Context) async -> Timeline<StatusEntry> {
        let now = Date(), cal = Calendar.current
        let midnights = (1...7).compactMap { cal.date(byAdding: .day, value: $0, to: cal.startOfDay(for: now)) }
        return Timeline(entries: [entry(configuration, now)] + midnights.map { entry(configuration, $0) }, policy: .after(midnights[0]))
    }

    private func entry(_ configuration: PickAircraftIntent, _ date: Date) -> StatusEntry {
        let a = SharedSnapshots.pick(configuration.aircraft?.id)
        let view = WidgetText.view(tail: a?.tail, snapshot: a.flatMap { SharedSnapshots.status($0.id) },
                                   today: WidgetText.localDay(date), now: date)
        return StatusEntry(date: date, view: view)
    }

    /// The gallery preview before any aircraft is on this phone.
    static let sample = WidgetView(
        tail: "N734DM",
        rows: [WidgetRow(key: nil, lead: "VOR check", rest: "lapsed Nov 12, IFR only", status: "overdue", value: "lapsed", about: "Nov 12", used: 1),
               WidgetRow(key: nil, lead: "Oil change", rest: "in 9.7 h, about Dec 12", status: "due_soon", value: "9.7 h", about: "about Dec 12", used: 0.8),
               WidgetRow(key: nil, lead: "Transponder test", rest: "due Dec 31", status: "current", value: "43 days", about: "Dec 31", used: 0.9)],
        empty: nil, asOf: nil, summary: "N734DM, next 60 days.", line: nil, aircraftId: nil)
}

// MARK: Line ahead (medium, large, lock screen)

struct LineAheadWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "line-ahead", intent: PickAircraftIntent.self, provider: StatusProvider()) { entry in
            LineAheadWidgetView(view: entry.view)
                .containerBackground(Tokens.Colors.leaf, for: .widget)
        }
        .configurationDisplayName("Line ahead")
        .description("The line ahead for the next 60 days and what comes due on it.")
        .supportedFamilies([.systemMedium, .systemLarge, .accessoryRectangular, .accessoryInline])
    }
}

struct LineAheadWidgetView: View {
    let view: WidgetView
    @Environment(\.widgetFamily) private var family

    var body: some View {
        Group {
            switch family {
            case .accessoryInline:
                // "N734DM: oil 9.7 h · transponder 43 d"
                Text(view.tail.map { t in "\(t): " + view.rows.prefix(2).map { "\($0.lead.lowercased()) \($0.value)" }.joined(separator: " · ") }
                     ?? "Open MyTailLog")
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    Text(view.tail.map { "\($0) next 60 days" } ?? "MyTailLog").font(.headline).widgetAccentable()
                    if view.tail == nil { Text(view.empty ?? "").font(.caption) }
                    ForEach(Array(view.rows.prefix(2).enumerated()), id: \.offset) { _, r in
                        Text("\(r.lead) \(r.rest)").font(.caption).lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            default:
                board
            }
        }
        .widgetURL(AppLinks.url(view.aircraftId))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(view.summary)
    }

    private var board: some View {
        VStack(alignment: .leading, spacing: 6) {
            Head(view: view)
            if let line = view.line { MiniLine(ahead: line) }
            let n = family == .systemLarge ? 5 : 2
            ForEach(Array(view.rows.prefix(n).enumerated()), id: \.offset) { _, r in
                Link(destination: AppLinks.url(view.aircraftId, r.key.map { "item/\($0)" } ?? "plan")) { RowView(row: r) }
            }
            if let empty = view.empty { Text(empty).font(.footnote).foregroundStyle(Tokens.Colors.ink2) }
            Spacer(minLength: 0)
        }
    }
}

// MARK: Next item (small, StandBy, lock screen circle)

struct NextItemWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "next-item", intent: PickAircraftIntent.self, provider: StatusProvider()) { entry in
            NextItemView(view: entry.view)
                .containerBackground(Tokens.Colors.leaf, for: .widget)
        }
        .configurationDisplayName("Next item")
        .description("The next item that comes due.")
        .supportedFamilies([.systemSmall, .accessoryCircular])
    }
}

struct NextItemView: View {
    let view: WidgetView
    @Environment(\.widgetFamily) private var family

    /// Overdue first if any, else the first item (visit lines are not items).
    private var row: WidgetRow? { view.rows.first { $0.status == "overdue" } ?? view.rows.first { $0.key != nil } }

    var body: some View {
        Group {
            if family == .accessoryCircular {
                circle
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Head(view: view)
                    if let row {
                        Text(row.lead).font(.subheadline.weight(.bold)).foregroundStyle(Tokens.Colors.ink).lineLimit(2)
                        Text(row.value).font(.system(size: 28, weight: .bold).monospacedDigit()).foregroundStyle(Tokens.Colors.ink)
                            .minimumScaleFactor(0.6).lineLimit(1)
                        if let about = row.about, row.status != "overdue" { Text(about).font(.caption).foregroundStyle(Tokens.Colors.ink2) }
                        Mark(status: row.status)
                    } else {
                        Text(view.empty ?? "").font(.footnote).foregroundStyle(Tokens.Colors.ink2)
                    }
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .widgetURL(AppLinks.url(view.aircraftId, row?.key.map { "item/\($0)" } ?? ""))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(view.summary)
    }

    /// Days or hours to the next item with a gauge of the interval used; overdue is a filled disc with "over".
    @ViewBuilder private var circle: some View {
        if let row {
            let number = row.value.split(separator: " ").first.map(String.init) ?? row.value
            if row.status == "overdue" {
                ZStack {
                    Circle().fill(.primary)
                    VStack(spacing: 0) {
                        Text(row.value == "lapsed" ? "!" : number).font(.system(size: 14, weight: .bold))
                        Text("over").font(.system(size: 9, weight: .semibold))
                    }
                    .foregroundStyle(.background)
                }
                .widgetAccentable()
            } else {
                Gauge(value: row.used) {
                    Text(row.lead)
                } currentValueLabel: {
                    Text(number).font(.system(size: 14, weight: .bold))
                }
                .gaugeStyle(.accessoryCircularCapacity)
            }
        } else {
            Image(systemName: "airplane").accessibilityHidden(true)
        }
    }
}

// MARK: Pieces

private struct Head: View {
    let view: WidgetView
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(view.tail ?? "MyTailLog").font(.headline.weight(.heavy)).foregroundStyle(Tokens.Colors.ink)
                if view.tail != nil { Text("next 60 days").font(.caption).foregroundStyle(Tokens.Colors.ink3) }
            }
            if let asOf = view.asOf { Text(asOf).font(.caption2).foregroundStyle(Tokens.Colors.ink3) }
            if view.tail == nil { Text(view.empty ?? "").font(.footnote).foregroundStyle(Tokens.Colors.ink2) }
        }
    }
}

private struct Mark: View {
    let status: String
    var body: some View {
        HStack(spacing: 5) {
            Canvas { ctx, s in
                ctx.statusMark(markKind(status == "visit" ? "current" : status), at: CGPoint(x: s.width / 2, y: s.height / 2),
                               radius: s.width / 2, ringWidth: 2.5)
            }
            .frame(width: 10, height: 10)
            .widgetAccentable()
            // A visit line says "Nov 23 visit:" itself; items carry their status word.
            if status != "visit" {
                Text(statusWord(status)).font(.caption.weight(.bold))
                    .foregroundStyle(status == "due_soon" || status == "overdue" ? Tokens.Colors.alarmText : Tokens.Colors.ink)
            }
        }
    }
}

private struct RowView: View {
    let row: WidgetRow
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Mark(status: row.status).fixedSize()
            Text("\(Text(row.lead).bold()) \(row.rest)").font(.footnote).foregroundStyle(Tokens.Colors.ink).lineLimit(1)
        }
    }
}

/// The 60-day line at widget scale (02 §9.14): the four book lines, solid to today then dotted, the listed rings.
private struct MiniLine: View {
    let ahead: StatusSnapshot.LineAhead
    var body: some View {
        Canvas { ctx, size in
            let w = size.width, gap = size.height / CGFloat(LineGeometry.lines.count), today = LineGeometry.past * w
            for (i, line) in LineGeometry.lines.enumerated() {
                let y = gap * (CGFloat(i) + 0.5)
                var past = Path(); past.move(to: CGPoint(x: 0, y: y)); past.addLine(to: CGPoint(x: today, y: y))
                ctx.stroke(past, with: .color(Tokens.Colors.line(line)), lineWidth: 2)
                var future = Path(); future.move(to: CGPoint(x: today, y: y)); future.addLine(to: CGPoint(x: w, y: y))
                ctx.stroke(future, with: .color(Tokens.Colors.line(line)), style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [0.1, 5]))
            }
            for ring in ahead.rings {
                guard let row = LineGeometry.row(ring.line) else { continue }
                let r: CGFloat = 5
                let x = min(max(LineGeometry.x(ring.date, ahead) * w, r), w - r)
                ctx.statusMark(markKind(ring.status), at: CGPoint(x: x, y: gap * (CGFloat(row) + 0.5)), radius: r, ringWidth: 2.5)
            }
        }
        .frame(height: 40)
        .accessibilityHidden(true)
    }
}

// MARK: Live Activity

struct ReadingLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ReadingAttributes.self) { context in
            ReadingLockView(attributes: context.attributes, state: context.state)
                .widgetURL(AppLinks.url(context.attributes.aircraftId, context.state.phase == .read ? "review" : "queue"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Image(systemName: "book.closed").accessibilityLabel("Pages") }
                DynamicIslandExpandedRegion(.trailing) { Text(context.attributes.tail).font(.headline) }
                DynamicIslandExpandedRegion(.bottom) { ReadingLockView(attributes: context.attributes, state: context.state, island: true) }
            } compactLeading: {
                Image(systemName: "book.closed").accessibilityLabel("Pages")
            } compactTrailing: {
                if context.state.phase == .read {
                    Image(systemName: "checkmark").accessibilityLabel("Read")
                } else {
                    Text(context.state.compact).monospacedDigit()
                }
            } minimal: {
                if context.state.phase == .read {
                    Image(systemName: "checkmark").accessibilityLabel("Read")
                } else if context.state.total > 0, context.state.phase != .onPhone, context.state.phase != .paused {
                    ProgressView(value: Double(context.state.done), total: Double(context.state.total)).progressViewStyle(.circular)
                } else {
                    Image(systemName: "book.closed").accessibilityLabel("Pages")
                }
            }
            .widgetURL(AppLinks.url(context.attributes.aircraftId, context.state.phase == .read ? "review" : "queue"))
        }
    }
}

private struct ReadingLockView: View {
    let attributes: ReadingAttributes
    let state: ReadingAttributes.ContentState
    var island = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !island {
                HStack(spacing: 6) {
                    Image(systemName: "book.closed").accessibilityHidden(true)
                    Text(attributes.tail).font(.headline)
                    Text("Pages in progress").font(.subheadline).foregroundStyle(.secondary)
                }
            }
            Text(state.text).font(.body.weight(.semibold)).foregroundStyle(.primary)
            if state.phase == .uploading || state.phase == .reading {
                ProgressView(value: Double(state.done), total: Double(max(state.total, 1))).tint(.primary)
            }
            if state.phase == .read {
                Link(destination: AppLinks.url(attributes.aircraftId, "review")) {
                    Text("Review").font(.body.weight(.bold)).padding(.horizontal, 14).padding(.vertical, 6)
                        .foregroundStyle(.primary)
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(.primary, lineWidth: 1.5))
                }
            }
        }
        .padding(island ? 0 : 16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: Previews (the gallery look, light and dark)

#Preview("Line ahead", as: .systemMedium) {
    LineAheadWidget()
} timeline: {
    StatusEntry(date: .now, view: StatusProvider.sample)
}

#Preview("Next item", as: .systemSmall) {
    NextItemWidget()
} timeline: {
    StatusEntry(date: .now, view: StatusProvider.sample)
}
