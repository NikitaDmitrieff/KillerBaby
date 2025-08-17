import { Link, Tabs, router } from 'expo-router';
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
  return (
    <>
      <View style={styles.wrapper}>
        <View style={styles.bar}>
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;
            const onPress = () => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name as never);
            };

            const label = descriptors[route.key]?.options.title ?? route.name;
            const iconName = iconForRoute(route.name);

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
          try {
            router.replace('/');
            return;
          } catch {}
          try {
            router.dismissAll();
          } catch {}
        }}
      >
        <Ionicons name="chevron-back" size={28} color="#fff" />
      </TouchableOpacity>

      <Link href="/create" asChild>
        <TouchableOpacity
          style={styles.fab}
          accessibilityRole="button"
          accessibilityLabel="Create new"
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </Link>
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


