import { Tabs, router } from 'expo-router';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme/colors';

type Props = React.ComponentProps<typeof Tabs>['tabBar'];

function iconForRoute(routeName: string): keyof typeof Ionicons.glyphMap {
  switch (routeName) {
    case 'assignment':
      return 'locate-outline';
    case 'feed':
      return 'newspaper-outline';
    case 'conversation':
      return 'chatbubbles-outline';
    case 'settings':
      return 'settings-outline';
    case 'assignments':
      return 'clipboard-outline';
    case 'players':
      return 'people-outline';
    default:
      return 'ellipse-outline';
  }
}

export function FloatingTabBar({ state, descriptors, navigation }: Parameters<NonNullable<Props>>[0]) {
  const currentRouteName = state.routes[state.index]?.name ?? '';

  const labelMap: Record<string, string> = {
    assignment: 'Assignment',
    feed: 'Group',
    conversation: 'Messages',
    assignments: 'Assignments',
    players: 'Players',
  };

  const visibleRoutes = state.routes.filter((r) => r.name !== 'settings');

  return (
    <>
      <View style={styles.wrapper}>
        <View style={styles.bar}>
          {visibleRoutes.map((route) => {
            if (route.name === 'settings') return null;
            const label = labelMap[route.name] ?? descriptors[route.key]?.options.title ?? route.name;
            const iconName = iconForRoute(route.name);
            const isConversation = route.name === 'conversation';
            const isFocused = isConversation ? currentRouteName === 'conversation' : currentRouteName === route.name;

            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name as never);
            };

            return (
              <TouchableOpacity key={route.key} accessibilityRole="button" onPress={onPress} style={styles.item} activeOpacity={0.85}>
                <Ionicons name={iconName as any} size={20} color={isFocused ? COLORS.brandPrimary : '#6b7280'} />
                <Text style={[styles.label, { color: isFocused ? COLORS.brandPrimary : '#6b7280' }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <TouchableOpacity
        style={styles.leftFab}
        accessibilityRole="button"
        accessibilityLabel="Back to groups"
        onPress={() => {
          // Always go to the app root index (app/index.tsx)
          try {
            router.replace('/');
          } catch {}
        }}
      >
        <Ionicons name="home" size={28} color="#fff" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.fab}
        accessibilityRole="button"
        accessibilityLabel="Open settings"
        onPress={() => {
          try {
            (navigation as any).navigate('settings');
          } catch {}
        }}
      >
        <Ionicons name="settings-outline" size={28} color="#fff" />
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 46,
    right: 46,
    bottom: 24,
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 24,
    height: 74,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    justifyContent: 'space-around',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  item: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 110,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  leftFab: {
    position: 'absolute',
    left: 24,
    bottom: 110,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.brandPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});

export default FloatingTabBar;


