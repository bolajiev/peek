import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  FlatList, Linking, Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import { getTheme } from '../theme';
import { useTheme } from '../navigation/AppNavigator';

interface Place {
  id: string;
  name: string;
  type: string;
  lat: number;
  lon: number;
  distM: number;
}

const RADIUS_M = 3000;

function distM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function escapeJs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/</g, '\\x3c').replace(/>/g, '\\x3e');
}

function buildLeafletHtml(lat: number, lon: number, places: Place[], isDark: boolean): string {
  const markers = places
    .slice(0, 20)
    .map(p => {
      const name = escapeJs(p.name);
      const dist = p.distM < 1000 ? `${Math.round(p.distM)}m` : `${(p.distM / 1000).toFixed(1)}km`;
      return `L.marker([${p.lat},${p.lon}]).addTo(map).bindPopup('<b>${name}</b><br>${escapeJs(typeLabel(p.type))}<br>${dist}');`;
    })
    .join('\n');

  const tileBg = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileAttr = isDark
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
body{margin:0;padding:0;background:${isDark ? '#111' : '#fff'}}
#map{width:100vw;height:100vh}
.leaflet-attribution-flag{display:none!important}
</style>
</head>
<body>
<div id="map"></div>
<script>
var map = L.map('map',{zoomControl:true}).setView([${lat},${lon}],14);
L.tileLayer('${tileBg}',{maxZoom:19,attribution:'${tileAttr}'}).addTo(map);
var you = L.circleMarker([${lat},${lon}],{radius:8,color:'#3b82f6',fillColor:'#3b82f6',fillOpacity:0.9,weight:2}).addTo(map);
you.bindPopup('You are here');
${markers}
</script>
</body>
</html>`;
}

function fmtDist(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function typeLabel(t: string): string {
  const map: Record<string, string> = {
    hospital: 'Hospital',
    pharmacy: 'Pharmacy',
    clinic: 'Clinic',
    doctors: 'Doctor',
  };
  return map[t] || t.charAt(0).toUpperCase() + t.slice(1);
}

export default function NearbyScreen() {
  const navigation = useNavigation<any>();
  const themeMode = useTheme();
  const theme = getTheme(themeMode);
  const isDark = themeMode === 'dark';

  const [phase, setPhase] = useState<'locating' | 'loading' | 'done' | 'error'>('locating');
  const [statusMsg, setStatusMsg] = useState('Getting your location...');
  const [places, setPlaces] = useState<Place[]>([]);
  const [mapHtml, setMapHtml] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    load();
    return () => { abortRef.current?.abort(); };
  }, []);

  const load = async () => {
    abortRef.current?.abort();
    setPhase('locating');
    setStatusMsg('Getting your location...');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setStatusMsg('Location permission denied. Enable it in Settings.');
        setPhase('error');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat = loc.coords.latitude;
      const lon = loc.coords.longitude;
      setPhase('loading');
      setStatusMsg('Finding nearby health facilities...');
      await fetchPlaces(lat, lon);
    } catch (e: any) {
      setStatusMsg('Could not determine your location.');
      setPhase('error');
    }
  };

  const fetchPlaces = async (lat: number, lon: number) => {
    try {
      abortRef.current = new AbortController();
      const overpassQuery = `[out:json][timeout:10];
(
  node["amenity"~"hospital|pharmacy|clinic|doctors"](around:${RADIUS_M},${lat},${lon});
  way["amenity"~"hospital|pharmacy|clinic|doctors"](around:${RADIUS_M},${lat},${lon});
);
out center;`;

      const resp = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(overpassQuery)}`,
        signal: abortRef.current.signal,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const elements = (json.elements || []) as any[];
      const result: Place[] = elements
        .map((el: any) => {
          const elLat = el.lat ?? el.center?.lat;
          const elLon = el.lon ?? el.center?.lon;
          if (!elLat || !elLon) return null;
          return {
            id: `${el.type}-${el.id}`,
            name: el.tags?.name || el.tags?.['name:en'] || typeLabel(el.tags?.amenity || 'health'),
            type: el.tags?.amenity || 'health',
            lat: elLat,
            lon: elLon,
            distM: distM(lat, lon, elLat, elLon),
          } as Place;
        })
        .filter(Boolean) as Place[];
      result.sort((a, b) => a.distM - b.distM);
      setPlaces(result);
      setMapHtml(buildLeafletHtml(lat, lon, result, isDark));
      setPhase('done');
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setStatusMsg('Could not load nearby places. Check your connection.');
      setPhase('error');
    }
  };

  const openMaps = (p: Place) => {
    const url = Platform.OS === 'android'
      ? `geo:${p.lat},${p.lon}?q=${encodeURIComponent(p.name)}`
      : `maps:?q=${encodeURIComponent(p.name)}&ll=${p.lat},${p.lon}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`);
    });
  };

  const renderPlace = ({ item: p }: { item: Place }) => (
    <TouchableOpacity
      style={[styles.placeRow, { backgroundColor: theme.card, borderColor: theme.border }]}
      onPress={() => openMaps(p)}
      activeOpacity={0.75}
    >
      <View style={styles.placeInfo}>
        <Text style={[styles.placeName, { color: theme.text }]} numberOfLines={1}>{p.name}</Text>
        <Text style={[styles.placeSub, { color: theme.textSecondary }]}>{typeLabel(p.type)}</Text>
      </View>
      <View style={styles.placeRight}>
        <Text style={[styles.placeDist, { color: theme.accent }]}>{fmtDist(p.distM)}</Text>
        <Text style={[styles.placeNav, { color: theme.textSecondary }]}>Navigate</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}>
          <Text style={[styles.back, { color: theme.accent }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Nearby Health</Text>
        {phase === 'error' ? (
          <TouchableOpacity onPress={load} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.retry, { color: theme.accent }]}>Retry</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 48 }} />
        )}
      </View>

      {(phase === 'locating' || phase === 'loading') && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} size="large" />
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>{statusMsg}</Text>
        </View>
      )}

      {phase === 'error' && (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>{statusMsg}</Text>
        </View>
      )}

      {phase === 'done' && mapHtml ? (
        <View style={styles.flex}>
          {/* Map */}
          <View style={[styles.mapContainer, { borderBottomColor: theme.border }]}>
            <WebView
              source={{ html: mapHtml }}
              style={[styles.map, { backgroundColor: theme.background }]}
              scrollEnabled={false}
              javaScriptEnabled
              originWhitelist={['*']}
            />
          </View>

          {/* List */}
          {places.length === 0 ? (
            <View style={styles.center}>
              <Text style={[styles.statusText, { color: theme.textSecondary }]}>No health facilities found within 3 km.</Text>
            </View>
          ) : (
            <FlatList
              data={places}
              keyExtractor={p => p.id}
              renderItem={renderPlace}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <Text style={[styles.listHeader, { color: theme.textSecondary }]}>
                  {places.length} place{places.length !== 1 ? 's' : ''} within 3 km
                </Text>
              }
            />
          )}
        </View>
      ) : null}

      {/* Disclosure */}
      <View style={[styles.disclosureBar, { borderTopColor: theme.border }]}>
        <Text style={[styles.disclosureText, { color: theme.textSecondary }]}>
          Map: OpenStreetMap · Data: OpenStreetMap contributors (ODbL) · Geocoding: Overpass API
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 56, paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1,
  },
  back: { fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  retry: { fontSize: 14, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  statusText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errorText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  mapContainer: { height: 280, borderBottomWidth: 1 },
  map: { flex: 1 },
  listContent: { padding: 12, gap: 8 },
  listHeader: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  placeRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 14,
    borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 10,
  },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 14, fontWeight: '600', lineHeight: 18 },
  placeSub: { fontSize: 12, marginTop: 2 },
  placeRight: { alignItems: 'flex-end', gap: 2 },
  placeDist: { fontSize: 13, fontWeight: '700' },
  placeNav: { fontSize: 10, fontWeight: '500' },
  disclosureBar: { borderTopWidth: 1, paddingVertical: 6, paddingHorizontal: 14 },
  disclosureText: { fontSize: 9, textAlign: 'center', lineHeight: 14 },
});
