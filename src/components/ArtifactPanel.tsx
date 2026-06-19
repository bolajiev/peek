import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView,
  Share, Alert, Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Markdown from 'react-native-markdown-display';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';

const { height: SH } = Dimensions.get('window');
const PANEL_H = SH * 0.72;

interface Props {
  visible: boolean;
  type: 'html' | 'md';
  source: string;
  title?: string;
  theme: any;
  onClose: () => void;
}

export default function ArtifactPanel({ visible, type, source, title = 'artifact', theme, onClose }: Props) {
  const [tab, setTab] = useState<'preview' | 'code'>('preview');
  const [copying, setCopying] = useState(false);
  const [saving, setSaving] = useState(false);
  const slideY = useRef(new Animated.Value(PANEL_H)).current;
  const backdropOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setTab('preview');
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, tension: 70, friction: 11, useNativeDriver: true }),
        Animated.timing(backdropOp, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(slideY, { toValue: PANEL_H, tension: 80, friction: 12, useNativeDriver: true }),
        Animated.timing(backdropOp, { toValue: 0, duration: 160, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  const ext = type === 'html' ? 'html' : 'md';

  const saveAndShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      const safeName = title.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 48);
      const file = new File(Paths.document, `${safeName}_${Date.now()}.${ext}`);
      file.write(source);
      if (!file.exists) throw new Error('Save failed');
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, {
          mimeType: type === 'html' ? 'text/html' : 'text/markdown',
          dialogTitle: `Share ${ext.toUpperCase()} artifact`,
        });
      } else {
        Alert.alert('Saved', `File saved to app storage:\n${safeName}.${ext}`);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not save file');
    } finally {
      setSaving(false);
    }
  };

  const copySource = async () => {
    await Clipboard.setStringAsync(source);
    setCopying(true);
    setTimeout(() => setCopying(false), 1600);
  };

  const htmlContent = type === 'html' ? source : `<html><body style="font-family:sans-serif;padding:16px;background:#111;color:#eee;">${source.replace(/\n/g, '<br/>')}</body></html>`;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)', opacity: backdropOp }]} pointerEvents="auto">
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[styles.panel, { backgroundColor: theme.card, transform: [{ translateY: slideY }] }]}
        pointerEvents="auto"
      >
        {/* Handle */}
        <View style={styles.handleWrap}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
        </View>

        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <View style={styles.tabs}>
            {(['preview', 'code'] as const).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.tab, tab === t && { borderBottomColor: theme.accent, borderBottomWidth: 2 }]}
                onPress={() => setTab(t)}
              >
                <Text style={[styles.tabText, { color: tab === t ? theme.accent : theme.textSecondary }]}>
                  {t === 'preview' ? 'Preview' : 'Code'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.cardAlt }]} onPress={copySource}>
              <Text style={[styles.actionBtnText, { color: copying ? theme.accent : theme.textSecondary }]}>
                {copying ? '✓' : 'Copy'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme.accent }]}
              onPress={saveAndShare}
              disabled={saving}
            >
              <Text style={[styles.actionBtnText, { color: theme.accentFg }]}>
                {saving ? '…' : 'Save & Share'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={[styles.closeBtn, { color: theme.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Body */}
        <View style={styles.body}>
          {tab === 'preview' ? (
            type === 'html' ? (
              <WebView
                source={{ html: htmlContent }}
                style={styles.webview}
                originWhitelist={['*']}
                javaScriptEnabled
                domStorageEnabled
                mixedContentMode="always"
              />
            ) : (
              <ScrollView style={styles.mdScroll} contentContainerStyle={styles.mdContent}>
                <Markdown style={mdStyles(theme)}>{source}</Markdown>
              </ScrollView>
            )
          ) : (
            <ScrollView style={styles.codeScroll} contentContainerStyle={styles.codeContent}>
              <Text selectable style={[styles.codeText, { color: theme.text }]}>{source}</Text>
            </ScrollView>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const mdStyles = (theme: any) => ({
  body: { color: theme.text, fontSize: 15, lineHeight: 22 },
  heading1: { color: theme.text, fontWeight: '700' as any, fontSize: 22, marginBottom: 8 },
  heading2: { color: theme.text, fontWeight: '700' as any, fontSize: 18, marginBottom: 6 },
  heading3: { color: theme.text, fontWeight: '600' as any, fontSize: 16, marginBottom: 4 },
  code_block: { backgroundColor: theme.cardAlt, borderRadius: 8, padding: 12, fontFamily: 'monospace' },
  code_inline: { backgroundColor: theme.cardAlt, borderRadius: 4, fontFamily: 'monospace' },
  blockquote: { backgroundColor: theme.cardAlt, borderLeftColor: theme.accent, borderLeftWidth: 3, paddingLeft: 12 },
  bullet_list_icon: { color: theme.accent },
  table: { borderColor: theme.border },
  th: { backgroundColor: theme.cardAlt },
  link: { color: theme.accent },
});

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: PANEL_H,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 24,
  },
  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 8,
    borderBottomWidth: 1,
  },
  tabs: { flexDirection: 'row', gap: 4 },
  tab: { paddingHorizontal: 14, paddingVertical: 8 },
  tabText: { fontSize: 13, fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
  closeBtn: { fontSize: 18, paddingHorizontal: 4 },
  body: { flex: 1 },
  webview: { flex: 1 },
  mdScroll: { flex: 1 },
  mdContent: { padding: 16 },
  codeScroll: { flex: 1 },
  codeContent: { padding: 16 },
  codeText: { fontSize: 12, fontFamily: 'monospace', lineHeight: 18 },
});
