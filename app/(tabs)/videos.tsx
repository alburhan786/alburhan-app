import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Linking,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const YOUTUBE_CHANNEL_URL = "https://www.youtube.com/@alburhantravels";

interface VideoItem {
  id: string;
  title: string;
  description: string;
  youtubeId: string;
  category: "hajj" | "transport" | "hotel" | "ziyarat";
  duration: string;
}

const VIDEOS: VideoItem[] = [
  {
    id: "1",
    title: "Hotel Makkah – Hajj 2019",
    description: "Tour of our Makkah hotel accommodation during Hajj 2019 with Al Burhan Tours & Travels",
    youtubeId: "KGROa5Si-Uo",
    category: "hotel",
    duration: "1:08",
  },
  {
    id: "2",
    title: "Private AC Bus – Hajj 2019",
    description: "Our private AC bus transport from Al Burhan Tours & Travels during Hajj 2019",
    youtubeId: "I4JvmRI-jGg",
    category: "transport",
    duration: "0:14",
  },
  {
    id: "3",
    title: "Hotel Makkah Restaurant – Hajj 2019",
    description: "Inside look at our Makkah hotel restaurant and meals from Al Burhan Tours & Travels",
    youtubeId: "k4LZ5KHk4ZY",
    category: "hotel",
    duration: "1:23",
  },
  {
    id: "4",
    title: "Ziyarat Madinah Munawwarah",
    description: "Holy sites tour of Madinah Munawwarah with Al Burhan Tours & Travels",
    youtubeId: "BLIjSpRd4Q4",
    category: "ziyarat",
    duration: "0:27",
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  all: "All Videos",
  hajj: "Hajj",
  hotel: "Hotels",
  transport: "Transport",
  ziyarat: "Ziyarat",
};

const CATEGORY_COLORS: Record<string, string> = {
  hajj: "#047857",
  hotel: "#2563eb",
  transport: "#D97706",
  ziyarat: "#7C3AED",
};

export default function VideosScreen() {
  const insets = useSafeAreaInsets();
  const [activeCategory, setActiveCategory] = useState("all");

  const filteredVideos =
    activeCategory === "all"
      ? VIDEOS
      : VIDEOS.filter((v) => v.category === activeCategory);

  const openVideo = (youtubeId: string) => {
    Linking.openURL(`https://www.youtube.com/watch?v=${youtubeId}`);
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS === "web" ? 67 : insets.top + 16 },
        ]}
      >
        <Text style={styles.headerTitle}>Videos</Text>
        <Text style={styles.headerSubtitle}>
          Hajj & Umrah Guides and More
        </Text>
      </View>

      <View style={styles.categoryBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.categoryChip,
                activeCategory === key && styles.categoryChipActive,
              ]}
              onPress={() => setActiveCategory(key)}
            >
              <Text
                style={[
                  styles.categoryChipText,
                  activeCategory === key && styles.categoryChipTextActive,
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        {filteredVideos.map((video) => (
          <TouchableOpacity
            key={video.id}
            style={styles.videoCard}
            onPress={() => openVideo(video.youtubeId)}
            activeOpacity={0.85}
          >
            <View style={styles.thumbnailContainer}>
              <Image
                source={{
                  uri: `https://img.youtube.com/vi/${video.youtubeId}/hqdefault.jpg`,
                }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
              <View style={styles.playOverlay}>
                <View style={styles.playButton}>
                  <Ionicons name="play" size={28} color="#FFFFFF" />
                </View>
              </View>
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{video.duration}</Text>
              </View>
            </View>

            <View style={styles.videoInfo}>
              <View style={styles.videoMeta}>
                <View
                  style={[
                    styles.categoryTag,
                    {
                      backgroundColor:
                        (CATEGORY_COLORS[video.category] || Colors.primary) +
                        "18",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryTagText,
                      {
                        color:
                          CATEGORY_COLORS[video.category] || Colors.primary,
                      },
                    ]}
                  >
                    {CATEGORY_LABELS[video.category]}
                  </Text>
                </View>
              </View>
              <Text style={styles.videoTitle}>{video.title}</Text>
              <Text style={styles.videoDescription} numberOfLines={2}>
                {video.description}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        {filteredVideos.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons
              name="videocam-outline"
              size={48}
              color={Colors.textSecondary}
            />
            <Text style={styles.emptyText}>No videos in this category</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.channelButton}
          onPress={() => Linking.openURL(YOUTUBE_CHANNEL_URL)}
          activeOpacity={0.85}
        >
          <Ionicons name="logo-youtube" size={24} color="#FFFFFF" />
          <View style={styles.channelBtnInfo}>
            <Text style={styles.channelBtnTitle}>@alburhantravels</Text>
            <Text style={styles.channelBtnSub}>Subscribe to our YouTube Channel</Text>
          </View>
          <Ionicons name="open-outline" size={18} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        <View style={{ height: Platform.OS === "web" ? 34 : 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.primary,
    padding: 20,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold" as const,
    color: "#FFFFFF",
    letterSpacing: 1,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.secondary,
    marginTop: 4,
  },
  categoryBar: {
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  categoryScroll: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: Colors.textSecondary,
  },
  categoryChipTextActive: {
    color: "#FFFFFF",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  videoCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  thumbnailContainer: {
    position: "relative" as const,
    height: 200,
    backgroundColor: "#1a1a2e",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(239,68,68,0.9)",
    justifyContent: "center" as const,
    alignItems: "center" as const,
    paddingLeft: 3,
  },
  durationBadge: {
    position: "absolute" as const,
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  durationText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600" as const,
  },
  videoInfo: {
    padding: 14,
  },
  videoMeta: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginBottom: 8,
  },
  categoryTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryTagText: {
    fontSize: 11,
    fontWeight: "700" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  videoTitle: {
    fontSize: 16,
    fontWeight: "bold" as const,
    color: Colors.text,
    marginBottom: 4,
    lineHeight: 22,
  },
  videoDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  emptyState: {
    padding: 60,
    alignItems: "center" as const,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: "center" as const,
  },
  channelButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "#FF0000",
    marginTop: 8,
    marginBottom: 8,
    padding: 16,
    borderRadius: 14,
    gap: 12,
    shadowColor: "#FF0000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  channelBtnInfo: {
    flex: 1,
  },
  channelBtnTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    marginBottom: 2,
  },
  channelBtnSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
  },
});
