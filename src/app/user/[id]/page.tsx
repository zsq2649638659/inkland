"use client";
import SiteIcon from "@/components/SiteIcon";

import { useCallback, useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { submitReportV1 } from "@/lib/reportContent";
import { useAuth } from "@/components/AuthProvider";
import ProfileCardCollection from "@/components/ProfileCardCollection";
import ProfileFilterSelect from "@/components/ProfileFilterSelect";
import { SkeletonProfile } from "@/components/Skeleton";
import EmptyState from "@/components/EmptyState";
import type { Post } from "@/lib/types";
import { useAppDialog } from "@/components/AppDialogProvider";
import DefaultAvatar from "@/components/DefaultAvatar";
import ModerationReasonModal from "@/components/ModerationReasonModal";
import { assertCanInteract } from "@/lib/userRestrictions";
import { assembleSeriesInfo } from "@/lib/seriesInfo";
import { slimContent } from "@/lib/feed";
import { includeTestDataForProfile, withTestDataVisibility } from "@/lib/test-data-visibility";
import { getPublicProfileBios, getSettingsPrivacyErrorMessage } from "@/lib/profile-privacy";
import { readAccountPreferences } from "@/lib/accountPreferences";
import type { SupabaseClient } from "@supabase/supabase-js";

interface FollowUser {
  id: string;
  nickname: string;
  avatar_url: string | null;
  bio: string | null;
  show_profile_info: boolean;
}

interface SeriesInfo {
  id: string;
  name: string;
  cover_url: string | null;
  description: string;
  series_type: string;
  tags: string[];
  status: string;
  created_at: string;
  latestChapterId: string | null;
  latestChapterNumber: number | null;
  latestChapterTitle: string | null;
  latestChapterContent: string | null;
  latestChapterCreatedAt: string | null;
  totalChapters: number;
  like_count: number;
  comment_count: number;
  bookmark_count: number;
}

type ProfileFilterType = "all" | "single" | "image" | "series";
type ProfileSortMode = "latest" | "hot";
type PublicActivityTab = "likes" | "bookmarks";
type ProfileCardLayout = "full" | "square";

interface ProfilePageControls {
  filterType: ProfileFilterType;
  sortMode: ProfileSortMode;
  query: string;
  layout: ProfileCardLayout;
}

interface ProfileTagCount {
  name: string;
  count: number;
}

async function loadTopPublishedTags(
  supabase: SupabaseClient,
  userId: string,
  includeTestData: boolean,
): Promise<ProfileTagCount[]> {
  const tagCounts = new Map<string, number>();
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await withTestDataVisibility(
      supabase
        .from("posts")
        .select("id, chapter_number, post_tags(tags(name))")
        .eq("user_id", userId)
        .eq("status", "published"),
      includeTestData,
    )
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error || !data) return [];

    const works = data as unknown as Array<{
      chapter_number: number | null;
      post_tags: Array<{ tags: { name: string } | Array<{ name: string }> | null }> | null;
    }>;
    for (const work of works) {
      if (typeof work.chapter_number === "number" && work.chapter_number > 0) continue;
      const workTags = new Set((work.post_tags || []).flatMap((item) => {
        const tags = Array.isArray(item.tags) ? item.tags : item.tags ? [item.tags] : [];
        return tags.map((tag) => tag.name).filter(Boolean);
      }));
      for (const tag of workTags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }

    if (works.length < pageSize) break;
    offset += pageSize;
  }

  return [...tagCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-CN"))
    .slice(0, 6);
}

function readProfilePageControls(params: Pick<URLSearchParams, "get">): ProfilePageControls {
  const requestedFilter = params.get("type");
  const requestedSort = params.get("sort");
  return {
    filterType: requestedFilter === "single" || requestedFilter === "image" || requestedFilter === "series" ? requestedFilter : "all",
    sortMode: requestedSort === "hot" ? "hot" : "latest",
    query: params.get("q") || "",
    layout: params.get("layout") === "square" ? "square" : "full",
  };
}

function writeProfilePageControls(controls: ProfilePageControls, mode: "push" | "replace") {
  const params = new URLSearchParams(window.location.search);
  params.delete("type");
  params.delete("sort");
  params.delete("q");
  params.delete("layout");
  if (controls.filterType !== "all") params.set("type", controls.filterType);
  if (controls.sortMode !== "latest") params.set("sort", controls.sortMode);
  if (controls.query) params.set("q", controls.query);
  if (controls.layout === "square") params.set("layout", controls.layout);
  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) window.history[mode === "push" ? "pushState" : "replaceState"](null, "", nextUrl);
}

function profileTabHref(id: string, currentParams: string, tab: string) {
  const params = new URLSearchParams(currentParams);
  if (tab === "works") params.delete("tab");
  else params.set("tab", tab);
  const query = params.toString();
  return `/user/${id}${query ? `?${query}` : ""}`;
}

function formatBirthDate(value: string | null) {
  if (!value) return "未设置";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "未设置" : date.toLocaleDateString("zh-CN");
}

const profileWorkFilters: Array<{ key: ProfileFilterType; label: string }> = [
  { key: "all", label: "全部" },
  { key: "single", label: "单篇" },
  { key: "image", label: "图片" },
  { key: "series", label: "长篇连载" },
];

function isProfileImagePost(post: Post): boolean {
  return Boolean(post.cover_url) || /!\[.*?\]\(.*?\)/.test(post.content || "");
}

function matchesActivityFilter(post: Post, filter: ProfileFilterType): boolean {
  if (filter === "all") return true;
  if (filter === "image") return isProfileImagePost(post);
  if (filter === "series") return post.post_type === "serial";
  return post.post_type !== "serial" && !isProfileImagePost(post);
}

export default function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const [reportOpen, setReportOpen] = useState(false);
  const { id } = use(params);
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "works";
  const supabase = createClient();
  const { user: currentUser, profile: currentProfile } = useAuth();
  const dialog = useAppDialog();
  const [posts, setPosts] = useState<Post[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesInfo[]>([]);
  const [profile, setProfile] = useState<{
    nickname: string;
    avatar_url: string | null;
    bio: string | null;
    show_gender: boolean;
    show_profile_info: boolean;
    show_likes: boolean;
    show_bookmarks: boolean;
    show_follow_lists: boolean;
    allow_follows: boolean;
    gender: "male" | "female" | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const initialControls = readProfilePageControls(searchParams);
  const [filterType, setFilterType] = useState<ProfileFilterType>(initialControls.filterType);
  const [sortMode, setSortMode] = useState<ProfileSortMode>(initialControls.sortMode);
  const [profileSearch, setProfileSearch] = useState(initialControls.query);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileDraftFilter, setMobileDraftFilter] = useState<ProfileFilterType>("all");
  const [mobileDraftSort, setMobileDraftSort] = useState<ProfileSortMode>("latest");
  const [mobileCardLayout, setMobileCardLayout] = useState<ProfileCardLayout>(initialControls.layout);
  const [activityPosts, setActivityPosts] = useState<Post[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState(false);
  const [activityRetryKey, setActivityRetryKey] = useState(0);
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [profileCounts, setProfileCounts] = useState<{ following: number | null; followers: number | null; works: number | null }>({ following: null, followers: null, works: null });
  const [topTags, setTopTags] = useState<ProfileTagCount[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [blockedRecordId, setBlockedRecordId] = useState<string | null>(null);
  const [blockDialog, setBlockDialog] = useState<"confirm" | "success" | null>(null);
  const [blockDialogMessage, setBlockDialogMessage] = useState("");
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockTargetId, setBlockTargetId] = useState<string | null>(null);
  const profileLoaded = Boolean(profile);
  const profileActivityVisible = activeTab === "likes" ? Boolean(profile?.show_likes) : activeTab === "bookmarks" ? Boolean(profile?.show_bookmarks) : false;
  const showPublicWorkControls = activeTab === "works" || profileActivityVisible;
  const includeTestDataForViewer = includeTestDataForProfile(currentProfile);

  const isOwnProfile = currentUser?.id === id;
  const relationshipListsVisible = isOwnProfile || profile?.show_follow_lists === true;
  const birthDateLabel = isOwnProfile
    ? formatBirthDate(readAccountPreferences(currentUser).birth_date)
    : "不公开";

  const applyProfileControls = (controls: ProfilePageControls, mode: "push" | "replace" = "push") => {
    writeProfilePageControls(controls, mode);
    setFilterType(controls.filterType);
    setSortMode(controls.sortMode);
    setProfileSearch(controls.query);
    setMobileCardLayout(controls.layout);
  };

  const openMobileFilters = () => {
    setMobileDraftFilter(filterType);
    setMobileDraftSort(sortMode);
    setMobileFilterOpen(true);
  };

  const filteredActivityPosts = useMemo(
    () => activityPosts.filter((post) => matchesActivityFilter(post, filterType)),
    [activityPosts, filterType],
  );

  useEffect(() => {
    const syncControlsFromUrl = () => {
      const controls = readProfilePageControls(new URLSearchParams(window.location.search));
      setFilterType(controls.filterType);
      setSortMode(controls.sortMode);
      setProfileSearch(controls.query);
      setMobileCardLayout(controls.layout);
    };
    window.addEventListener("popstate", syncControlsFromUrl);
    return () => window.removeEventListener("popstate", syncControlsFromUrl);
  }, []);

  const searchParamsKey = searchParams.toString();

  const loadFollowers = useCallback(async () => {
    if (!relationshipListsVisible) {
      setTabLoading(false);
      return;
    }
    setTabLoading(true);
    const { data: fData } = await supabase.rpc("get_public_follow_list", { p_user_id: id, p_direction: "followers" });
    const rows = (fData || []) as Array<{ profile_id: string; nickname: string; avatar_url: string | null; show_profile_info: boolean; is_test_account: boolean }>;
    const visibleRows = rows.filter((row) => includeTestDataForViewer || !row.is_test_account);
    const bios = await getPublicProfileBios(supabase, visibleRows.map((row) => row.profile_id));
    setFollowers(visibleRows.map((row) => ({
      id: row.profile_id,
      nickname: row.nickname,
      avatar_url: row.avatar_url,
      bio: bios.get(row.profile_id) || null,
      show_profile_info: row.show_profile_info,
    })));
    setTabLoading(false);
  }, [id, includeTestDataForViewer, relationshipListsVisible, supabase]);

  const loadFollowing = useCallback(async () => {
    if (!relationshipListsVisible) {
      setTabLoading(false);
      return;
    }
    setTabLoading(true);
    const { data: fData } = await supabase.rpc("get_public_follow_list", { p_user_id: id, p_direction: "following" });
    const rows = (fData || []) as Array<{ profile_id: string; nickname: string; avatar_url: string | null; show_profile_info: boolean; is_test_account: boolean }>;
    const visibleRows = rows.filter((row) => includeTestDataForViewer || !row.is_test_account);
    const bios = await getPublicProfileBios(supabase, visibleRows.map((row) => row.profile_id));
    setFollowing(visibleRows.map((row) => ({
      id: row.profile_id,
      nickname: row.nickname,
      avatar_url: row.avatar_url,
      bio: bios.get(row.profile_id) || null,
      show_profile_info: row.show_profile_info,
    })));
    setTabLoading(false);
  }, [id, includeTestDataForViewer, relationshipListsVisible, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if ((activeTab === "followers" || activeTab === "following") && !relationshipListsVisible) setTabLoading(false);
      else if (activeTab === "followers") void loadFollowers();
      else if (activeTab === "following") void loadFollowing();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, loadFollowers, loadFollowing, relationshipListsVisible]);

  useEffect(() => {
    const load = async () => {
      const includeTestData = includeTestDataForViewer;
      let profileQuery = supabase.from("profiles").select("nickname, avatar_url, show_gender, show_profile_info, show_likes, show_bookmarks, show_follow_lists, allow_follows").eq("id", id);
      if (!includeTestData) profileQuery = profileQuery.eq("is_test_account", false);
      const profilePromise = profileQuery.single();
      const postsPromise = withTestDataVisibility(
        supabase
          .from("posts")
          .select("id, title, content, word_count, post_type, created_at, series_name, chapter_number, cover_url, user_id, post_tags(tags(name)), author:profiles!posts_user_id_fkey(nickname, avatar_url)")
          .eq("user_id", id).eq("status", "published"),
        includeTestData,
      ).order("created_at", { ascending: false }).limit(50);
      const seriesPromise = withTestDataVisibility(
        supabase
          .from("series")
          .select("id, name, cover_url, description, series_type, tags, status, created_at")
          .eq("user_id", id),
        includeTestData,
      ).order("created_at", { ascending: false });
      const worksCountPromise = withTestDataVisibility(
        supabase.from("posts").select("id", { count: "exact", head: true }).eq("user_id", id).eq("status", "published")
          .or("post_type.neq.serial,chapter_number.is.null,chapter_number.eq.0"),
        includeTestData,
      );
      const followCountsPromise = isOwnProfile
        ? Promise.all([
          supabase.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", id),
          supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", id),
        ])
        : supabase.rpc("get_public_profile_follow_counts", { p_user_id: id });
      const [{ data: prof }, { data: rawData }, { data: allSeriesData }, worksCountResult, followCountsResult, nextTopTags] = await Promise.all([
        profilePromise,
        postsPromise,
        seriesPromise,
        worksCountPromise,
        followCountsPromise,
        loadTopPublishedTags(supabase, id, includeTestData),
      ]);
      setTopTags(nextTopTags);
      if (isOwnProfile && Array.isArray(followCountsResult)) {
        setProfileCounts({
          following: followCountsResult[0].count ?? null,
          followers: followCountsResult[1].count ?? null,
          works: worksCountResult.count ?? null,
        });
      } else {
        const countRow = Array.isArray(followCountsResult.data) ? followCountsResult.data[0] : null;
        const counts = countRow as { following_count?: number | null; followers_count?: number | null } | null;
        setProfileCounts({
          following: counts?.following_count ?? null,
          followers: counts?.followers_count ?? null,
          works: worksCountResult.count ?? null,
        });
      }
      if (prof) {
        const profileData = prof as {
          nickname: string;
          avatar_url: string | null;
          show_gender: boolean;
          show_profile_info: boolean;
          show_likes: boolean;
          show_bookmarks: boolean;
          show_follow_lists: boolean;
          allow_follows: boolean;
        };
        const bios = await getPublicProfileBios(supabase, [id]);
        let gender: "male" | "female" | null = null;
        if (profileData.show_gender) {
          const { data: publicGender } = await supabase.rpc("get_public_profile_gender", { p_user_id: id });
          gender = publicGender === "male" || publicGender === "female" ? publicGender : null;
        }
        setProfile({ ...profileData, bio: bios.get(id) || null, gender });
      }

      if (rawData) {
        const rawArr = rawData as unknown as Record<string, unknown>[];

        // 分离：普通帖子 vs 连载元数据 vs 连载章节
        const normalPosts: Record<string, unknown>[] = [];
        const serialMetaPosts: Record<string, unknown>[] = [];

        for (const p of rawArr) {
          if (p.post_type === "serial") {
            const cn = p.chapter_number as number | null | undefined;
            if (cn && cn > 0) {
              continue;
            }
            serialMetaPosts.push(p);
          } else {
            normalPosts.push(p);
          }
        }

        // 加载热度数据
        const allIds = [...normalPosts, ...serialMetaPosts].map((p) => p.id as string);
        const { data: stats } = await supabase
          .from("post_stats")
          .select("id, like_count, comment_count, bookmark_count")
          .in("id", allIds);
        const statsMap = new Map<string, { like_count: number; comment_count: number; bookmark_count: number }>();
        if (stats) for (const s of stats as Array<Record<string, unknown>>) {
          statsMap.set(s.id as string, {
            like_count: s.like_count as number,
            comment_count: s.comment_count as number,
            bookmark_count: s.bookmark_count as number,
          });
        }

        // 格式化普通帖子
        const formatted: Post[] = normalPosts.map((p) => {
          const ptags = (p.post_tags as Array<{ tags: { name: string } }> | undefined)?.map((pt) => pt.tags?.name) || [];
          const author = p.author as { nickname: string; avatar_url: string | null } | null;
          const st = statsMap.get(p.id as string) || { like_count: 0, comment_count: 0, bookmark_count: 0 };

          return {
            id: p.id as string,
            title: (p.title as string) || "无标题",
            content: slimContent((p.content as string) || ""),
            cover_url: p.cover_url as string | null,
            word_count: p.word_count as number,
            created_at: p.created_at as string,
            user_id: p.user_id as string,
            series_name: p.series_name as string | null,
            chapter_number: p.chapter_number as number | null,
            post_type: p.post_type as Post["post_type"],
            tags: ptags,
            author: { nickname: author?.nickname || "匿名用户", avatar_url: author?.avatar_url },
            like_count: st.like_count,
            comment_count: st.comment_count,
            bookmark_count: st.bookmark_count,
          } as Post;
        });

        setPosts(formatted);
        // 帖子和个人资料先出屏，系列摘要在后台批量补齐，不阻塞用户查看普通作品。
        setLoading(false);

        // 处理连载：从 series 表加载元数据
        const seriesNames = [...new Set(serialMetaPosts.map((p) => p.series_name as string).filter(Boolean))];

        let matchedSeries: Record<string, unknown>[] = [];
        if (allSeriesData) {
          // 从 posts 中匹配到的 series 优先，同时补充 posts 中不存在的空系列
          const seriesNameSet = new Set(seriesNames);
          const allSeries = allSeriesData as unknown as Record<string, unknown>[];
          // 先取在 posts 中有对应记录的系列
          const fromPosts = allSeries.filter((s) => seriesNameSet.has(s.name as string));
          // 再取 posts 中没有记录的系列（空系列）
          const emptySeries = allSeries.filter((s) => !seriesNameSet.has(s.name as string));
          matchedSeries = [...fromPosts, ...emptySeries];
        }

        if (matchedSeries.length > 0) {
          const seen = new Set<string>();
          const deduped = (matchedSeries as unknown as SeriesInfo[]).filter((s) => {
            if (seen.has(s.name)) return false;
            seen.add(s.name);
            return true;
          });

          const seriesWithChapters = await assembleSeriesInfo(supabase, deduped, { includeTestData });

          setSeriesList(seriesWithChapters);
        }
      }

      if (currentUser && !isOwnProfile) {
        const [{ data: followData }, { data: blockedData }] = await Promise.all([
          supabase.from("follows").select("id").eq("follower_id", currentUser.id).eq("following_id", id).maybeSingle(),
          supabase.from("blocked_users").select("id").eq("user_id", currentUser.id).eq("blocked_user_id", id).maybeSingle(),
        ]);
        setIsFollowing(!!followData);
        setBlockedRecordId(blockedData?.id || null);
      }
      setLoading(false);
    };
    load();
  }, [id, supabase, currentUser, includeTestDataForViewer, isOwnProfile]);

  useEffect(() => {
    if (activeTab !== "likes" && activeTab !== "bookmarks") return;
    if (!profileLoaded) return;
    const sourceTable: PublicActivityTab = activeTab;
    if (!profileActivityVisible) return;

    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      setActivityLoading(true);
      setActivityError(false);
    });
    void (async () => {
      const { data: interactions, error: interactionError } = await supabase
        .from(sourceTable)
        .select("post_id, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (interactionError) throw interactionError;
      const interactionRows = (interactions || []) as Array<{ post_id: string; created_at: string }>;
      const postIds = interactionRows.map((row) => row.post_id).filter(Boolean);
      if (!postIds.length) {
        if (active) setActivityPosts([]);
        return;
      }

      const { data: rawPosts, error: postError } = await withTestDataVisibility(
        supabase
          .from("posts")
          .select("id, title, content, word_count, post_type, created_at, published_at, series_name, chapter_number, cover_url, user_id, post_tags(tags(name)), author:profiles!posts_user_id_fkey(nickname, avatar_url)")
          .in("id", postIds)
          .eq("status", "published"),
        includeTestDataForViewer,
      );
      if (postError) throw postError;
      const orderedRows = ((rawPosts || []) as unknown as Array<Record<string, unknown>>)
        .sort((left, right) => postIds.indexOf(left.id as string) - postIds.indexOf(right.id as string));
      const { data: stats } = orderedRows.length
        ? await supabase
          .from("post_stats")
          .select("id, like_count, comment_count, bookmark_count")
          .in("id", orderedRows.map((post) => post.id as string))
        : { data: [] };
      const statsMap = new Map<string, { like_count: number; comment_count: number; bookmark_count: number }>();
      for (const stat of (stats || []) as Array<Record<string, unknown>>) {
        statsMap.set(stat.id as string, {
          like_count: (stat.like_count as number) || 0,
          comment_count: (stat.comment_count as number) || 0,
          bookmark_count: (stat.bookmark_count as number) || 0,
        });
      }
      const formatted: Post[] = orderedRows.map((post) => {
        const tags = (post.post_tags as Array<{ tags: { name: string } | null }> | undefined)?.map((item) => item.tags?.name).filter(Boolean) || [];
        const author = post.author as { nickname: string; avatar_url: string | null } | null;
        const postStats = statsMap.get(post.id as string) || { like_count: 0, comment_count: 0, bookmark_count: 0 };
        return {
          id: post.id as string,
          title: (post.title as string) || "无标题",
          content: slimContent((post.content as string) || ""),
          cover_url: post.cover_url as string | null,
          word_count: post.word_count as number,
          created_at: post.created_at as string,
          published_at: post.published_at as string | null,
          user_id: post.user_id as string,
          series_name: post.series_name as string | null,
          chapter_number: post.chapter_number as number | null,
          post_type: post.post_type as Post["post_type"],
          tags,
          author: { nickname: author?.nickname || "匿名用户", avatar_url: author?.avatar_url },
          ...postStats,
        } as Post;
      });
      if (active) setActivityPosts(formatted);
    })()
      .catch(() => { if (active) setActivityError(true); })
      .finally(() => { if (active) setActivityLoading(false); });
    return () => { active = false; };
  }, [activeTab, activityRetryKey, id, includeTestDataForViewer, profileActivityVisible, profileLoaded, supabase]);

  const handleFollow = async () => {
    if (!currentUser) return;
    setFollowLoading(true);
    if (isFollowing) {
      const { error } = await supabase.from("follows").delete().eq("follower_id", currentUser.id).eq("following_id", id);
      if (!error) {
        setIsFollowing(false);
      }
    } else {
      if (profile?.allow_follows === false) {
        dialog.toast("该用户暂不接受新的关注。", "danger");
        setFollowLoading(false);
        return;
      }
      const blocked = await assertCanInteract();
      if (blocked) {
        setFollowLoading(false);
        dialog.toast(blocked, "danger");
        return;
      }
      const { error } = await supabase.from("follows").insert({ follower_id: currentUser.id, following_id: id });
      if (!error) {
        setIsFollowing(true);
      } else {
        dialog.toast(getSettingsPrivacyErrorMessage(error) || "关注失败，请稍后重试。", "danger");
      }
    }
    setFollowLoading(false);
  };

  const handleUnfollow = async (targetUserId: string) => {
    if (!currentUser) return;
    const { error } = await supabase.from("follows").delete().eq("follower_id", currentUser.id).eq("following_id", targetUserId);
    if (!error) {
      setFollowing((prev) => prev.filter((u) => u.id !== targetUserId));
    }
  };

  const handleBlock = async (targetUserId: string) => {
    if (!currentUser) return;
    setMoreOpen(false);
    if (targetUserId === currentUser.id) {
      setBlockDialogMessage("不能屏蔽自己。");
      setBlockDialog("success");
      return;
    }
    setBlockTargetId(targetUserId);
    if (blockedRecordId) {
      setBlockBusy(true);
      const { error } = await supabase.from("blocked_users").delete().eq("id", blockedRecordId);
      setBlockBusy(false);
      if (error) {
        setBlockDialogMessage("取消屏蔽失败，请稍后重试。");
      } else {
        setBlockedRecordId(null);
        setBlockDialogMessage("已取消屏蔽，你可以再次看到对方的作品和互动。");
      }
      setBlockDialog("success");
      return;
    }
    setBlockDialogMessage("");
    setBlockDialog("confirm");
  };

  const confirmBlock = async () => {
    if (!currentUser || !blockTargetId || blockBusy) return;
    setBlockBusy(true);
    const { data: createdBlock, error } = await supabase.from("blocked_users").insert({
      user_id: currentUser.id,
      blocked_user_id: blockTargetId,
    }).select("id").single();
    setBlockBusy(false);
    if (error && !(error as unknown as Record<string, unknown>).code?.toString().includes("23505")) {
      setBlockDialogMessage("屏蔽失败，请稍后重试。");
      setBlockDialog("success");
      return;
    }
    if (blockTargetId === id) setBlockedRecordId(createdBlock?.id || blockedRecordId || "blocked");
    if (activeTab === "following") {
      setFollowing((prev) => prev.filter((u) => u.id !== blockTargetId));
    } else {
      setFollowers((prev) => prev.filter((u) => u.id !== blockTargetId));
    }
    setBlockDialogMessage("已屏蔽该用户，你将不再看到对方的作品和互动。");
    setBlockDialog("success");
  };

  const handleReport = () => {
    setMoreOpen(false);
    setReportOpen(true);
  };

  const handleRemoveFollower = async (targetUserId: string) => {
    if (!currentUser) return;
    const { error } = await supabase.from("follows").delete().eq("follower_id", targetUserId).eq("following_id", currentUser.id);
    if (!error) {
      setFollowers((prev) => prev.filter((u) => u.id !== targetUserId));
    }
  };

  const displayName = profile?.nickname || "匿名用户";

  // Close dropdown on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".profile-actions-wrapper")) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [moreOpen]);

  if (loading) return <div className="min-h-screen bg-paper"><main className="max-w-4xl mx-auto px-4 py-8"><SkeletonProfile /></main></div>;

  return (
    <div id="page-user" className="min-h-screen bg-paper">
      <main className="main-container">
        <div className="user-profile-layout">
        <div className="user-main-content">

        <div className="tabs-wrapper user-public-tabs" aria-label="个人主页内容">
          <div className="tabs-inner">
            <Link href={profileTabHref(id, searchParamsKey, "works")} scroll={false} className={`tab-btn${activeTab === "works" ? " active" : ""}`}>作品</Link>
            <Link href={profileTabHref(id, searchParamsKey, "likes")} scroll={false} className={`tab-btn${activeTab === "likes" ? " active" : ""}`}>喜欢</Link>
            <Link href={profileTabHref(id, searchParamsKey, "bookmarks")} scroll={false} className={`tab-btn${activeTab === "bookmarks" ? " active" : ""}`}>收藏</Link>
          </div>
        </div>
        </div>

        <aside className="sidebar user-profile-sidebar" aria-label={`${displayName}的资料`}>
          <div className="sidebar-card">
            <div className="sidebar-user">
              <div className="sidebar-user-avatar">
                {profile?.avatar_url ? <Image src={profile.avatar_url} alt="" width={64} height={64} unoptimized /> : <DefaultAvatar name={displayName} style={{ width: "100%", height: "100%", borderRadius: "inherit" }} />}
              </div>
              <div className="sidebar-user-info">
                <h1 className="sidebar-user-name">{displayName}</h1>
                {!isOwnProfile && currentUser ? (
                  <div className="profile-actions user-profile-actions">
                    <button
                      className={`btn-follow ${isFollowing ? "btn-follow-outline" : "btn-follow-primary"}`}
                      onClick={handleFollow}
                      disabled={followLoading || (!isFollowing && profile?.allow_follows === false)}
                    >
                      {followLoading ? (
                        <SiteIcon name="fa-spinner" variant="solid" className="animate-spin" />
                      ) : isFollowing ? (
                        <><SiteIcon name="fa-check" variant="solid" /> 已关注</>
                      ) : profile?.allow_follows === false ? (
                        <>暂不接受关注</>
                      ) : (
                        <><SiteIcon name="fa-plus" variant="solid" /> 关注</>
                      )}
                    </button>
                    <div className="profile-actions-wrapper user-profile-actions-wrapper">
                      <button
                        className={`btn-more user-profile-more-button${isFollowing ? " user-profile-more-button--following" : ""} ${moreOpen ? "active" : ""}`}
                        onClick={(e) => { e.stopPropagation(); setMoreOpen(!moreOpen); }}
                        aria-label="更多"
                        title="更多"
                      >
                        <SiteIcon name="fa-ellipsis-vertical" variant="solid" />
                        <span>更多</span>
                      </button>
                      {moreOpen && (
                        <div className="comment-popup show" onClick={(e) => e.stopPropagation()}>
                          <button className="comment-popup-item" onClick={() => void handleBlock(id)}>
                            <SiteIcon name="fa-action-forbid" variant="outline" hoverVariant="solid" />
                            {blockedRecordId ? "取消屏蔽" : "屏蔽"}
                          </button>
                          <button className="comment-popup-item" onClick={handleReport}>
                            <SiteIcon name="fa-flag" variant="outline" hoverVariant="solid" />
                            举报
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
                <div className="sidebar-user-bio">{profile?.show_profile_info ? profile.bio || "这个人很懒，什么都没写" : "这个人很懒，什么都没写"}</div>
                <div className="sidebar-user-stats" aria-label="关注、粉丝和作品数量">
                  {relationshipListsVisible ? (
                    <Link href={profileTabHref(id, searchParamsKey, "following")} className="sidebar-stat sidebar-stat-link" aria-label={`查看${displayName}的关注列表，共${profileCounts.following ?? "未知"}人`}>
                      <div className="sidebar-stat-value">{profileCounts.following ?? "—"}</div>
                      <div className="sidebar-stat-label">关注</div>
                    </Link>
                  ) : (
                    <div className="sidebar-stat" aria-label={`关注 ${profileCounts.following ?? "—"}，列表不公开`}>
                      <div className="sidebar-stat-value">{profileCounts.following ?? "—"}</div>
                      <div className="sidebar-stat-label">关注</div>
                    </div>
                  )}
                  {relationshipListsVisible ? (
                    <Link href={profileTabHref(id, searchParamsKey, "followers")} className="sidebar-stat sidebar-stat-link" aria-label={`查看${displayName}的粉丝列表，共${profileCounts.followers ?? "未知"}人`}>
                      <div className="sidebar-stat-value">{profileCounts.followers ?? "—"}</div>
                      <div className="sidebar-stat-label">粉丝</div>
                    </Link>
                  ) : (
                    <div className="sidebar-stat" aria-label={`粉丝 ${profileCounts.followers ?? "—"}，列表不公开`}>
                      <div className="sidebar-stat-value">{profileCounts.followers ?? "—"}</div>
                      <div className="sidebar-stat-label">粉丝</div>
                    </div>
                  )}
                  <div className="sidebar-stat" aria-label={`已发布作品 ${profileCounts.works ?? "—"}`}>
                    <div className="sidebar-stat-value">{profileCounts.works ?? "—"}</div>
                    <div className="sidebar-stat-label">作品</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="user-profile-sidebar-details">
              <h2>个人信息</h2>
              <dl>
                <div><dt>ID</dt><dd>{id}</dd></div>
                <div><dt>性别</dt><dd>{profile?.show_gender && profile.gender ? profile.gender === "male" ? "男" : "女" : "不公开"}</dd></div>
                <div><dt>出生日期</dt><dd>{birthDateLabel}</dd></div>
              </dl>
            </div>
            {topTags.length > 0 && (
              <div className="user-profile-sidebar-tags">
                <h2>创作标签</h2>
                <div>{topTags.map((tag) => <Link href={`/tag/${encodeURIComponent(tag.name)}`} className="tag tag--site site-card__tag" key={tag.name}>{tag.name}</Link>)}</div>
              </div>
            )}
          </div>
        </aside>

        <div className="user-work-content">

        {/* ─── Followers / Following Tab ─── */}
        {(activeTab === "followers" || activeTab === "following") && (
          <div>
            {!relationshipListsVisible ? (
              <div className="text-center py-12" role="status">
                <EmptyState icon="fa-user-shield" title="该用户暂未公开关注和粉丝列表" />
              </div>
            ) : tabLoading ? (
              <p className="text-sm text-muted text-center py-8">加载中...</p>
            ) : (activeTab === "followers" ? followers : following).length === 0 ? (
              <div className="text-center py-12">
                <EmptyState
                  icon={activeTab === "followers" ? "fa-users" : "fa-user-check"}
                  title={activeTab === "followers" ? "还没有粉丝" : "还没有关注任何人"}
                />
              </div>
            ) : (
              <div className="space-y-2">
                {(activeTab === "followers" ? followers : following).map((u) => (
                  <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-rule hover:border-accent transition-colors">
                    <Link href={`/user/${u.id}`} className="flex items-center gap-3 flex-1 min-w-0 no-underline">
                      <span className="rounded-full overflow-hidden inline-flex flex-shrink-0" style={{ width: "var(--ink-avatar-size-md)", height: "var(--ink-avatar-size-md)" }}>
                        {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" alt="" /> : <DefaultAvatar name={u.nickname || "?"} style={{ width:"100%", height:"100%" }} />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-warm">{u.nickname}</div>
                        {u.show_profile_info && u.bio && <div className="text-xs text-muted truncate">{u.bio}</div>}
                      </div>
                      <SiteIcon name="fa-chevron-right" variant="solid" className="text-xs text-muted" />
                    </Link>
                    {isOwnProfile && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {activeTab === "following" ? (
                          <button
                            className="px-2.5 py-1 text-xs rounded-full border border-red-300 text-red-500 bg-transparent cursor-pointer hover:bg-red-50 transition-colors"
                            onClick={(e) => { e.preventDefault(); handleUnfollow(u.id); }}
                          >
                            取消关注
                          </button>
                        ) : (
                          <button
                            className="px-2.5 py-1 text-xs rounded-full border border-red-300 text-red-500 bg-transparent cursor-pointer hover:bg-red-50 transition-colors"
                            onClick={(e) => { e.preventDefault(); handleRemoveFollower(u.id); }}
                          >
                            移除粉丝
                          </button>
                        )}
                        <button
                          className="px-2.5 py-1 text-xs rounded-full border border-red-300 text-red-500 bg-transparent cursor-pointer hover:bg-red-50 transition-colors"
                          onClick={(e) => { e.preventDefault(); handleBlock(u.id); }}
                        >
                          拉黑
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Works Section ─── */}
        {activeTab !== "followers" && activeTab !== "following" && (
          <>
            {showPublicWorkControls && <div className="filter-system-composition-row user-filter-composition" data-composition-contract="filter.toolbar@0.1" data-composition-dependencies="Input Select">
              <div className="filter-system-field filter-system-field--query">
                <div className="profile-filter-search-shell">
                  <SiteIcon name="fa-magnifying-glass" variant="solid" aria-hidden="true" />
                  <input className="form-control" type="search" value={profileSearch} onChange={(event) => applyProfileControls({ filterType, sortMode, query: event.target.value, layout: mobileCardLayout }, "replace")} placeholder={activeTab === "likes" ? "搜索喜欢的作品标题…" : activeTab === "bookmarks" ? "搜索收藏的作品标题…" : "搜索作品标题…"} aria-label={activeTab === "likes" ? "搜索喜欢的作品标题" : activeTab === "bookmarks" ? "搜索收藏的作品标题" : "搜索作品标题"} />
                  <button type="button" className="profile-filter-search-clear" aria-label="清除搜索作品" onClick={() => applyProfileControls({ filterType, sortMode, query: "", layout: mobileCardLayout }, "replace")}>
                    <SiteIcon name="fa-xmark" variant="solid" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <ProfileFilterSelect label="作品类型" id="user-filter-type-menu" value={filterType} options={profileWorkFilters.map((item) => ({ value: item.key, label: item.key === "all" ? "所有作品" : item.label }))} onChange={(value) => applyProfileControls({ filterType: value as ProfileFilterType, sortMode, query: profileSearch, layout: mobileCardLayout })} />
              <ProfileFilterSelect label="排序" id="user-filter-sort-menu" value={sortMode} options={[{ value: "latest", label: "最新发布" }, { value: "hot", label: "热度最高" }]} onChange={(value) => applyProfileControls({ filterType, sortMode: value as ProfileSortMode, query: profileSearch, layout: mobileCardLayout })} />
            </div>}

            {showPublicWorkControls && <div className="profile-mobile-filter-bar">
              <button type="button" className="profile-mobile-filter-button profile-mobile-icon-button" onClick={openMobileFilters} aria-label="打开筛选"><SiteIcon name="fa-filter" variant="default" aria-hidden="true" /><span>筛选</span></button>
              <button type="button" className="profile-mobile-filter-button profile-mobile-icon-button" onClick={() => applyProfileControls({ filterType, sortMode, query: profileSearch, layout: mobileCardLayout === "full" ? "square" : "full" })} aria-label="切换卡片布局" aria-pressed={mobileCardLayout === "square"}><SiteIcon name={mobileCardLayout === "full" ? "fa-card-compact" : "fa-list-compact"} variant="default" aria-hidden="true" /><span>布局</span></button>
            </div>}
            {showPublicWorkControls && mobileFilterOpen && (
              <div className="profile-filter-drawer-backdrop" role="presentation" onClick={() => setMobileFilterOpen(false)}>
                <section className="profile-filter-drawer" role="dialog" aria-modal="true" aria-label={activeTab === "likes" ? "筛选喜欢的作品" : activeTab === "bookmarks" ? "筛选收藏的作品" : "筛选作品"} onClick={(event) => event.stopPropagation()}>
                  <h2>{activeTab === "likes" ? "筛选喜欢的作品" : activeTab === "bookmarks" ? "筛选收藏的作品" : "筛选作品"}</h2>
                  <div className="profile-filter-drawer-section"><strong>作品类型</strong><div>{profileWorkFilters.map((item) => <button key={item.key} type="button" className={`profile-filter-control${mobileDraftFilter === item.key ? " is-active" : ""}`} onClick={() => setMobileDraftFilter(item.key)}>{item.label}</button>)}</div></div>
                  <div className="profile-filter-drawer-section"><strong>排序</strong><div>{[{ value: "latest" as const, label: "最新发布" }, { value: "hot" as const, label: "热度最高" }].map((item) => <button key={item.value} type="button" className={`profile-filter-control${mobileDraftSort === item.value ? " is-active" : ""}`} onClick={() => setMobileDraftSort(item.value)}>{item.label}</button>)}</div></div>
                  <div className="profile-filter-drawer-actions"><button type="button" onClick={() => { setMobileDraftFilter("all"); setMobileDraftSort("latest"); }}>重置</button><button type="button" className="is-primary" onClick={() => { applyProfileControls({ filterType: mobileDraftFilter, sortMode: mobileDraftSort, query: profileSearch, layout: mobileCardLayout }); setMobileFilterOpen(false); }}>应用筛选</button></div>
                </section>
              </div>
            )}
            {activeTab === "works" ? (
              <ProfileCardCollection posts={posts} series={seriesList} filter={filterType} query={profileSearch} status="all" sort={sortMode} limit={50} mobileLayout={mobileCardLayout} />
            ) : activeTab !== "likes" && activeTab !== "bookmarks" ? (
              <ProfileCardCollection posts={posts} series={seriesList} filter={filterType} query={profileSearch} status="all" sort={sortMode} limit={50} mobileLayout={mobileCardLayout} />
            ) : !(activeTab === "likes" ? profile?.show_likes : profile?.show_bookmarks) ? (
              <div className="user-activity-state" role="status"><EmptyState icon="fa-eye-slash" title={activeTab === "likes" ? "该用户隐藏了Ta的喜欢" : "该用户隐藏了Ta的收藏"} /></div>
            ) : activityLoading ? (
              <p className="text-sm text-muted text-center py-8" role="status">正在加载…</p>
            ) : activityError ? (
              <div className="user-activity-state" role="alert"><p>列表暂时加载失败，请重试。</p><button type="button" onClick={() => setActivityRetryKey((value) => value + 1)}>重试</button></div>
            ) : activityPosts.length ? (
              <ProfileCardCollection posts={filteredActivityPosts} series={[]} filter="all" query={profileSearch} status="all" sort={sortMode} limit={50} mobileLayout={mobileCardLayout} />
            ) : (
              <div className="user-activity-state" role="status"><EmptyState icon={activeTab === "likes" ? "fa-heart" : "fa-bookmark"} title={activeTab === "likes" ? "还没有公开喜欢的作品" : "还没有公开收藏的作品"} /></div>
            )}
          </>
        )}
        <div className={`modal-overlay${blockDialog ? " active" : ""}`} onClick={() => { if (!blockBusy) setBlockDialog(null); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="profile-block-dialog-title" onClick={(event) => event.stopPropagation()}>
            {blockDialog === "confirm" ? (
              <>
                <div className="modal-title" id="profile-block-dialog-title">确认屏蔽</div>
                <div className="modal-body"><p>屏蔽后，你将不再看到对方的作品、评论和互动。之后也可以在“屏蔽管理”中取消。</p></div>
                <div className="modal-actions">
                  <button className="btn-modal btn-modal-cancel" onClick={() => setBlockDialog(null)} disabled={blockBusy}>取消</button>
                  <button className="btn-modal btn-modal-danger" onClick={() => void confirmBlock()} disabled={blockBusy}>{blockBusy ? "处理中…" : "确认屏蔽"}</button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-title" id="profile-block-dialog-title">{blockDialogMessage.includes("失败") || blockDialogMessage.includes("不能") ? "操作提示" : "操作成功"}</div>
                <div className="modal-body"><p>{blockDialogMessage}</p></div>
                <div className="modal-actions"><button className="btn-modal btn-modal-primary" onClick={() => setBlockDialog(null)}>知道了</button></div>
              </>
            )}
          </div>
        </div>
        <ModerationReasonModal open={reportOpen} mode="report" onClose={() => setReportOpen(false)} onSubmit={async (reason, details) => {
          if (!currentUser) return;
          const result = await submitReportV1(supabase, { targetType: "user", targetId: id, reason, details });
          setReportOpen(false);
          setBlockDialogMessage(result.message);
          setBlockDialog("success");
        }} />
        </div>
        </div>
      </main>
    </div>
  );
}
