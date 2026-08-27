import { useState } from 'react';
import { followUser, unfollowUser } from '../utils/spacetime';
import { useOrg } from '../contexts/OrgContext';

interface FollowButtonProps {
  targetIdentity: string;
  isFollowing: boolean;
  onFollowChange: (following: boolean) => void;
}

function FollowButton({ targetIdentity, isFollowing, onFollowChange }: FollowButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { activeOrg } = useOrg();

  const handleClick = async () => {
    setIsLoading(true);
    try {
      if (isFollowing) {
        await unfollowUser(targetIdentity, activeOrg?.id);
      } else {
        await followUser(targetIdentity, activeOrg?.id);
      }
      onFollowChange(!isFollowing);
    } catch (error) {
      console.error('Failed to update follow:', error);
      alert(error instanceof Error ? error.message : 'Failed to update follow');
    }
    setIsLoading(false);
  };

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={`follow-button ${isFollowing ? 'following' : ''}`}
    >
      {isLoading ? 'Loading...' : isFollowing ? 'Following' : 'Follow'}
    </button>
  );
}

export default FollowButton;
