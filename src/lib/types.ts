export interface Profile {
  id?: string;
  nickname?: string;
  username?: string;
  avatar_url?: string | null;
  bio?: string | null;
  created_at?: string;
}

export interface Post {
  id: string;
  user_id?: string;
  title?: string;
  content?: string;
  cover_url?: string | null;
  visibility?: "public" | "followers_only" | "private";
  word_count?: number;
  status?: "draft" | "published";
  review_status?: "pending" | "approved" | "rejected" | string;
  review_reason?: string | null;
  rating?: "all" | "r15" | "r18";
  post_type?: "novel" | "illustration" | "comic" | "ramble" | "cosplay" | "other" | "serial" | "article";
  series_name?: string | null;
  chapter_number?: number | null;
  chapter_title?: string | null;
  author_note?: string | null;
  created_at?: string;
  updated_at?: string;
  published_at?: string | null;
  // Joined fields
  author?: Profile;
  tags?: string[] | Tag[];
  image_count?: number;
  like_count?: number;
  comment_count?: number;
  bookmark_count?: number;
  // Display helpers
  time_ago?: string;
  excerpt?: string;
  images?: string[];
}

export interface Tag {
  id: string;
  name: string;
  type: "cp" | "character" | "fandom" | "rating" | "status" | "genre";
  post_count: number;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  paragraph_index: number | null;
  content: string;
  created_at: string;
  author?: Profile;
  reply_count?: number;
  like_count?: number;
  // 楼中楼回复
  replies?: Comment[];
  // 当前用户是否已点赞
  liked_by_me?: boolean;
}

export interface CommentLike {
  id: string;
  user_id: string;
  comment_id: string;
  created_at: string;
}

export interface Like {
  id: string;
  user_id: string;
  post_id: string;
  created_at: string;
}

export interface Bookmark {
  id: string;
  user_id: string;
  post_id: string;
  folder_name: string;
  created_at: string;
}

export interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}
