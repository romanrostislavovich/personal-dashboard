import { parseGoogleTimeline } from './google-timeline';

describe('a Google Maps timeline', () => {
  it('reads the old Records.json', () => {
    const parsed = parseGoogleTimeline({
      locations: [
        {
          latitudeE7: 522297000,
          longitudeE7: 210122000,
          accuracy: 20,
          timestamp: '2023-05-01T08:00:00Z',
        },
        {
          latitudeE7: 522298000,
          longitudeE7: 210123000,
          accuracy: 15,
          timestampMs: '1682928060000',
        },
      ],
    });
    expect(parsed.locations).toEqual([
      { at: '2023-05-01T08:00:00.000Z', latitude: 52.2297, longitude: 21.0122, accuracy: 20 },
      { at: '2023-05-01T08:01:00.000Z', latitude: 52.2298, longitude: 21.0123, accuracy: 15 },
    ]);
  });

  it('turns a visit of the semantic history into fixes, and keeps its name', () => {
    const parsed = parseGoogleTimeline({
      timelineObjects: [
        {
          placeVisit: {
            location: { latitudeE7: 522320366, longitudeE7: 210067166, name: 'Green Caffè Nero' },
            duration: {
              startTimestamp: '2023-05-01T10:00:00Z',
              endTimestamp: '2023-05-01T10:30:00Z',
            },
          },
        },
      ],
    });
    expect(parsed.locations).toHaveLength(7);
    expect(parsed.names).toEqual([
      { latitude: 52.2320366, longitude: 21.0067166, name: 'Green Caffè Nero' },
    ]);
  });

  it('reads the new export from the phone: visits, paths and raw signals', () => {
    const parsed = parseGoogleTimeline({
      semanticSegments: [
        {
          startTime: '2024-06-01T10:00:00.000+02:00',
          endTime: '2024-06-01T10:10:00.000+02:00',
          visit: { topCandidate: { placeLocation: { latLng: '52.2297°, 21.0122°' } } },
        },
        {
          startTime: '2024-06-01T10:10:00.000+02:00',
          endTime: '2024-06-01T10:20:00.000+02:00',
          timelinePath: [{ point: '52.23°, 21.013°', time: '2024-06-01T10:12:00.000+02:00' }],
        },
      ],
      rawSignals: [
        {
          position: {
            LatLng: '52.231°, 21.014°',
            accuracyMeters: 9,
            timestamp: '2024-06-01T10:15:00.000+02:00',
          },
        },
      ],
    });
    expect(parsed.locations.map((fix) => fix.at)).toEqual([
      '2024-06-01T08:00:00.000Z',
      '2024-06-01T08:05:00.000Z',
      '2024-06-01T08:10:00.000Z',
      '2024-06-01T08:12:00.000Z',
      '2024-06-01T08:15:00.000Z',
    ]);
  });

  it('reads the array of the iPhone export, with "geo:" points', () => {
    const parsed = parseGoogleTimeline([
      {
        startTime: '2024-06-01T10:00:00.000Z',
        endTime: '2024-06-01T10:20:00.000Z',
        timelinePath: [{ point: 'geo:52.2297,21.0122', durationMinutesOffsetFromStartTime: '5' }],
      },
    ]);
    expect(parsed.locations).toEqual([
      { at: '2024-06-01T10:05:00.000Z', latitude: 52.2297, longitude: 21.0122, accuracy: 25 },
    ]);
  });

  it('a file of something else gives nothing', () => {
    expect(parseGoogleTimeline({ hello: 'world' })).toEqual({ locations: [], names: [] });
  });
});
