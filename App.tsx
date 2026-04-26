import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, View, Text } from 'react-native';

import SwapScreen from './src/screens/SwapScreen';
import StatsScreen from './src/screens/StatsScreen';
import StakeScreen from './src/screens/StakeScreen';
import SettingsScreen from './src/screens/SettingsScreen';

// Import background task registration
import './src/services/backgroundTask';

const Tab = createBottomTabNavigator();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Swap: '⟲',
    Stats: '◎',
    SCR: '◆',
    Settings: '⚙',
  };

  return (
    <View style={tabStyles.iconContainer}>
      <Text
        style={[
          tabStyles.icon,
          { color: focused ? '#14F195' : '#666' },
        ]}
      >
        {icons[label] ?? '•'}
      </Text>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 22,
  },
});

export default function App() {
  return (
    <>
      <StatusBar style="light" />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarIcon: ({ focused }) => (
              <TabIcon label={route.name} focused={focused} />
            ),
            tabBarActiveTintColor: '#14F195',
            tabBarInactiveTintColor: '#666',
            tabBarStyle: {
              backgroundColor: '#0a0a0a',
              borderTopColor: '#1a1a2e',
              borderTopWidth: 1,
              paddingTop: 8,
              paddingBottom: 8,
              height: 60,
            },
            tabBarLabelStyle: {
              fontSize: 11,
              fontWeight: '600',
            },
          })}
        >
          <Tab.Screen name="Swap" component={SwapScreen} />
          <Tab.Screen name="Stats" component={StatsScreen} />
          <Tab.Screen name="SCR" component={StakeScreen} />
          <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </>
  );
}
