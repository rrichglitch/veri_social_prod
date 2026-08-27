import { formatRelativeTime } from '../utils/sanitize';

interface UserProfile {
  identity: string;
  full_name: string;
  profile_picture: string;
  city: string;
  description: string;
  created_at: Date;
}

interface StoryPost {
  id: number;
  profile_owner_identity: string;
  poster_identity: string;
  content: string;
  media_data: string;
  media_types: string;
  created_at: Date;
}

interface PostCardProps {
  post: StoryPost;
  ownerProfile?: UserProfile;
  posterProfile?: UserProfile;
  onPosterClick: (posterIdentity: string) => void;
  showDelete?: boolean;
  onDelete?: () => void;
}

function PostCard({
  post,
  posterProfile,
  onPosterClick,
  showDelete = false,
  onDelete,
}: PostCardProps) {
  const posterName = posterProfile?.full_name || 'Someone';
  const posterPicture = posterProfile?.profile_picture;

  let mediaElements: { type: string; data: string }[] = [];
  try {
    if (post.media_data && post.media_types) {
      const mediaData = JSON.parse(post.media_data);
      const mediaTypes = JSON.parse(post.media_types);
      mediaElements = mediaData.map((data: string, i: number) => ({
        type: mediaTypes[i],
        data,
      }));
    }
  } catch {
    // Invalid media data
  }

  const handlePosterClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onPosterClick(post.poster_identity);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete();
    }
  };

  return (
    <div className="post-card">
      <div className="post-header">
        <div className="poster-info" onClick={handlePosterClick}>
          {posterPicture ? (
            <img src={posterPicture} alt={posterName} className="poster-picture" />
          ) : (
            <div className="poster-placeholder" />
          )}
          <div className="poster-details">
            <span className="poster-name">{posterName}</span>
            <span className="post-time">{formatRelativeTime(post.created_at)}</span>
          </div>
        </div>
        {showDelete && (
          <button onClick={handleDelete} className="delete-button" title="Delete post">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        )}
      </div>

      <div className="post-content">
        <p>{post.content}</p>
      </div>

      {mediaElements.length > 0 && (
        <div className="post-media">
          {mediaElements.map((media, index) => (
            <div key={index} className="media-item">
              {media.type.startsWith('image/') && (
                <img
                  src={`data:${media.type};base64,${media.data}`}
                  alt="Post media"
                  className="media-image"
                />
              )}
              {media.type.startsWith('video/') && (
                <video
                  src={`data:${media.type};base64,${media.data}`}
                  controls
                  className="media-video"
                />
              )}
              {media.type.startsWith('audio/') && (
                <audio
                  src={`data:${media.type};base64,${media.data}`}
                  controls
                  className="media-audio"
                />
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .post-card {
          background: white;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .post-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .poster-info {
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
        }

        .poster-picture, .poster-placeholder {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          object-fit: cover;
        }

        .poster-placeholder {
          background: #e0e0e0;
        }

        .poster-details {
          display: flex;
          flex-direction: column;
        }

        .poster-name {
          font-weight: 600;
          color: #333;
        }

        .post-time {
          font-size: 12px;
          color: #999;
        }

        .delete-button {
          padding: 8px;
          background: transparent;
          border: none;
          color: #999;
          cursor: pointer;
          border-radius: 6px;
        }

        .delete-button:hover {
          background: #fee2e2;
          color: #dc2626;
        }

        .post-content {
          margin-bottom: 12px;
        }

        .post-content p {
          margin: 0;
          color: #333;
          line-height: 1.5;
          white-space: pre-wrap;
        }

        .post-media {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .media-item {
          border-radius: 8px;
          overflow: hidden;
        }

        .media-image {
          width: 100%;
          max-height: 400px;
          object-fit: contain;
          background: #f5f5f5;
        }

        .media-video, .media-audio {
          width: 100%;
          max-height: 400px;
        }
      `}</style>
    </div>
  );
}

export default PostCard;
