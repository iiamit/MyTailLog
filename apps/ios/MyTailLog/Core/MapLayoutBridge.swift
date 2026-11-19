import MyTailLogCore

// The one place the app touches the KMP core's map layout (apps/core/domain map/MapLayout.kt; 05 §21, 10 §11).
// Swift values in, Swift values out, so views never see Kotlin types.

extension MapData {
    /// Positions every primitive for `options` with the core's layout: the same code Android runs, fixture-tested
    /// against the web's map-layout.ts within 0.5 units.
    func layout(_ options: MapLayoutOptions) -> MapLayout {
        let o = LayoutOptions(size: options.size, renderedWidth: options.renderedWidth.map { KotlinDouble(value: $0) },
                              zoom: options.zoom.map { DateRange(from: $0.from, to: $0.to) },
                              planAhead: options.planAhead ?? false,
                              window: options.window.map { DateRange(from: $0.from, to: $0.to) },
                              allEras: options.allEras ?? false)
        return MapLayout(MapLayoutKt.layoutMap(m: kotlin, o: o))
    }

    private var kotlin: MapModel {
        MapModel(
            today: today,
            range: MapRange(from: range.from, to: range.to, scaleBreak: range.scaleBreak),
            lines: lines.map { l in
                MapLine(lineId: l.lineId, logbook: l.logbook, logbookId: l.logbookId, name: l.name,
                        volumes: l.volumes.map { MapVolume(id: $0.id, label: $0.label, from: $0.from, to: $0.to) })
            },
            stops: stops.map { s in
                MapStop(id: s.id, lineId: s.lineId, logbook: s.logbook, date: s.date, entryIds: s.entryIds, trust: s.trust,
                        pageIds: s.pageIds, label: s.label, major: s.major)
            },
            interchanges: interchanges.map {
                MapInterchange(id: $0.id, date: $0.date, stopIds: $0.stopIds, lineIds: $0.lineIds, trust: $0.trust, label: $0.label)
            },
            gaps: gaps.map {
                MapGap(id: $0.id, lineId: $0.lineId, logbook: $0.logbook, from: $0.from, to: $0.to, status: $0.status,
                       unconfirmedPages: Int32($0.unconfirmedPages))
            },
            eras: eras.map {
                MapEra(lineId: $0.lineId, logbook: $0.logbook, from: $0.from, to: $0.to, label: $0.label, anchorEntryId: $0.anchorEntryId)
            },
            squawks: squawks.map { MapSquawk(id: $0.id, date: $0.date, open: $0.open, line: $0.line, lineId: $0.lineId) },
            rings: rings.map {
                MapRing(itemKey: $0.itemKey, line: $0.line, lineId: $0.lineId, date: $0.date, dateKind: $0.dateKind,
                        status: $0.status, label: $0.label, kind: $0.kind)
            },
            visits: visits.map {
                MapVisit(id: $0.id, suggestionKey: $0.suggestionKey, state: $0.state, weekOf: $0.weekOf, itemKeys: $0.itemKeys, label: $0.label)
            },
            undatedEntries: Int32(undatedEntries))
    }
}

private extension MapLayout {
    init(_ k: Layout) {
        func seg(_ s: LSeg?) -> Seg? { s.map { Seg(x1: $0.x1, y1: $0.y1, x2: $0.x2, y2: $0.y2) } }
        self.init(
            size: k.size, width: k.width, height: k.height, fontSize: k.fontSize,
            lanes: k.lanes.map { Lane(lineId: $0.lineId, logbook: $0.logbook, name: $0.name, c: $0.c, nameX: $0.nameX, nameY: $0.nameY, anchor: $0.anchor) },
            segments: k.segments.map { Segment(lineId: $0.lineId, kind: $0.kind, gapId: $0.gapId, x1: $0.x1, y1: $0.y1, x2: $0.x2, y2: $0.y2) },
            stops: k.stops.map { Stop(id: $0.id, lineId: $0.lineId, x: $0.x, y: $0.y, r: $0.r, dotted: $0.dotted, major: $0.major, count: Int($0.count), ids: $0.ids) },
            interchanges: k.interchanges.map {
                Capsule(id: $0.id, x: $0.x, y: $0.y, w: $0.w, h: $0.h, dotted: $0.dotted, dots: $0.dots.map { Point(x: $0.x, y: $0.y) })
            },
            rings: k.rings.map { Ring(itemKey: $0.itemKey, lineId: $0.lineId, x: $0.x, y: $0.y, r: $0.r, status: $0.status) },
            visits: k.visits.map { Visit(id: $0.id, state: $0.state, x: $0.x, y: $0.y, w: $0.w, h: $0.h) },
            eras: k.eras.map { Era(lineId: $0.lineId, x: $0.x, y: $0.y, w: $0.w, h: $0.h) },
            squawks: k.squawks.map { Squawk(id: $0.id, x: $0.x, y: $0.y, open: $0.open) },
            today: seg(k.today), scaleBreak: seg(k.scaleBreak),
            window: k.window.map { Rect(x: $0.x, y: $0.y, w: $0.w, h: $0.h) },
            ticks: k.ticks.map { Tick(x: $0.x, y: $0.y, label: $0.label, anchor: $0.anchor) },
            labels: k.labels.map { Label(key: $0.forKey, text: $0.text, x: $0.x, y: $0.y, anchor: $0.anchor) },
            more: Int(k.more))
    }
}
