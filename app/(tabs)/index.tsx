import React from "react";
import { StyleSheet, View, Dimensions } from "react-native";
import MapView, { LocalTile } from "react-native-maps";
import * as FileSystem from "expo-file-system";

export default function MapScreen() {
  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: 22.5726,   // Kolkata
          longitude: 88.3639,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
      >
        {/* Load offline tiles from app storage */}
        <LocalTile
          pathTemplate={`${FileSystem.documentDirectory}tiles/{z}/{x}/{y}.png`}
          tileSize={256}
        />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: Dimensions.get("window").width,
    height: Dimensions.get("window").height,
  },
});
