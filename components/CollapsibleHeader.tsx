import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, View, Text as RNText, StyleSheet, Platform, StatusBar, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GRADIENTS } from '../theme/colors';

let LinearGradient: any;
try {
  LinearGradient = require('expo-linear-gradient').LinearGradient;
} catch (error) {
  LinearGradient = ({ colors, style, children }: any) => (
    <View style={[style, { backgroundColor: colors?.[0] ?? '#9d0208' }]}>{children}</View>
  );
}

export type CollapsibleHeaderRenderParams = {
  onScroll: (...args: any[]) => void;
  contentInsetTop: number;
  scrollRef: React.RefObject<any>;
};

export type CollapsibleHeaderRightAccessoryParams = {
  collapseProgress: Animated.AnimatedInterpolation<any>;
};

export type CollapsibleHeaderAccessoryProps = {
  collapseProgress: Animated.AnimatedInterpolation<any>;
  expandedTranslateY?: number;
  collapsedTranslateY?: number;
  style?: any;
  children: React.ReactNode;
};

export function CollapsibleHeaderAccessory({
  collapseProgress,
  expandedTranslateY = 10,
  collapsedTranslateY = 0,
  style,
  children,
}: CollapsibleHeaderAccessoryProps) {
  const translateY = collapseProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [expandedTranslateY, collapsedTranslateY],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View style={[{ transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}

interface CollapsibleHeaderProps {
  title: string;
  subtitle?: string;
  gradient?: readonly [string, string];
  contentContainerStyle?: ViewStyle;
  renderContent: (params: CollapsibleHeaderRenderParams) => React.ReactNode;
  renderRightAccessory?: (params: CollapsibleHeaderRightAccessoryParams) => React.ReactNode;
  isRefreshing?: boolean;
  contentGap?: number;
}

export function CollapsibleHeader({
  title,
  subtitle,
  gradient = GRADIENTS.brand,
  contentContainerStyle,
  renderContent,
  renderRightAccessory,
  isRefreshing = false,
  contentGap = 8,
}: CollapsibleHeaderProps) {
  const insets = useSafeAreaInsets();

  const MAX_HEADER_HEIGHT = 64 + (Number(insets.top) || 0);
  const MIN_HEADER_HEIGHT = 44 + (Number(insets.top) || 0);
  const COLLAPSE_DISTANCE = MAX_HEADER_HEIGHT - MIN_HEADER_HEIGHT + 50;

  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<any>(null);

  const headerHeight = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE],
    outputRange: [MAX_HEADER_HEIGHT, MIN_HEADER_HEIGHT],
    extrapolate: 'clamp',
  });

  const pullDownTranslateY = scrollY.interpolate({
    inputRange: [-200, 0, COLLAPSE_DISTANCE],
    outputRange: [200, 0, 0],
    extrapolateLeft: 'extend',
    extrapolateRight: 'clamp',
  });

  const largeTitleOpacity = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE * 0.6],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const largeTitleTranslateY = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE],
    outputRange: [0, -4],
    extrapolate: 'clamp',
  });

  const centerTitleOpacity = scrollY.interpolate({
    inputRange: [COLLAPSE_DISTANCE * 0.2, COLLAPSE_DISTANCE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const centerTitleTranslateY = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE],
    outputRange: [2, 0],
    extrapolate: 'clamp',
  });

  const dividerOpacity = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE * 0.9],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const contentInsetTop = useMemo(() => MAX_HEADER_HEIGHT + contentGap, [MAX_HEADER_HEIGHT, contentGap]);
  const centerTop = useMemo(() => {
    const top = Number(insets.top) - 10 || 0;
    return top + (MIN_HEADER_HEIGHT - top) / 2 - 15;
  }, [insets.top, MIN_HEADER_HEIGHT]);

  const collapseProgress = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const overscrollExtra = scrollY.interpolate({
    inputRange: [-300, 0],
    outputRange: [300, 0],
    extrapolate: 'clamp',
  });
  const backgroundHeight: any = Animated.add(headerHeight as any, overscrollExtra as any);

  const animatedOnScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: false }
  );

  useEffect(() => {
    if (!isRefreshing) {
      const id = setTimeout(() => {
        scrollY.setValue(0);
      }, 0);
      return () => clearTimeout(id);
    }
  }, [isRefreshing, scrollY]);

  return (
    <View style={styles.container}>
      {Platform.OS === 'ios' ? (
        <StatusBar barStyle={'light-content'} />
      ) : (
        <StatusBar backgroundColor="transparent" translucent />
      )}

      <Animated.View pointerEvents="none" style={[styles.bgOverlay, { height: backgroundHeight }]}>
        <LinearGradient colors={gradient} style={styles.headerBg} />
      </Animated.View>

      {renderContent({ onScroll: animatedOnScroll, contentInsetTop, scrollRef })}

      <Animated.View
        pointerEvents="box-none"
        style={[styles.header, { height: headerHeight, paddingTop: insets.top, transform: [{ translateY: pullDownTranslateY }] }]}
      >
        <LinearGradient colors={gradient} style={styles.headerBg} />

        <Animated.Text numberOfLines={1} style={[styles.largeTitle, { color: '#FFFFFF', opacity: largeTitleOpacity, transform: [{ translateY: largeTitleTranslateY }] }]}>
          {title}
        </Animated.Text>

        {subtitle ? (
          <Animated.Text numberOfLines={1} style={[styles.leftSubtitle, { opacity: largeTitleOpacity }]}>
            {subtitle}
          </Animated.Text>
        ) : null}

        <Animated.View pointerEvents="none" style={[styles.centerTitleWrap, { top: centerTop, opacity: centerTitleOpacity, transform: [{ translateY: centerTitleTranslateY }] }]}>
          <RNText numberOfLines={1} style={[styles.centerTitle, { color: '#FFFFFF' }]}>
            {title}
          </RNText>
        </Animated.View>

        {renderRightAccessory ? (
          <Animated.View pointerEvents="box-none" style={[styles.rightAccessory, { top: centerTop }]}>
            {renderRightAccessory({ collapseProgress })}
          </Animated.View>
        ) : null}

        <Animated.View style={[styles.divider, { backgroundColor: '#241E6F66', opacity: dividerOpacity }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { position: 'absolute', left: 0, right: 0, top: 0, justifyContent: 'flex-end' },
  headerBg: { ...StyleSheet.absoluteFillObject },
  bgOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  largeTitle: { fontSize: 28, fontWeight: '700', paddingHorizontal: 16, paddingBottom: 2 },
  leftSubtitle: { fontSize: 14, fontWeight: '500', paddingHorizontal: 16, paddingBottom: 8, color: '#FFFFFF', opacity: 0.9 },
  centerTitleWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  centerTitle: { fontSize: 22, fontWeight: '700' },
  rightAccessory: { position: 'absolute', right: 16, zIndex: 20 },
  divider: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth + 1 },
});

export default CollapsibleHeader;


