import type { Asset } from '@interactive-drama/domain';
import { Button, Empty } from 'antd';

export function VideoTab({
  assets,
  videoAssetId,
  onChange,
}: {
  assets: Asset[];
  videoAssetId: string | null;
  onChange: (assetId: string | null) => void;
}) {
  const availableAssets = assets.filter((asset) => asset.status === 'available');
  const selectedAsset = availableAssets.find((asset) => asset.id === videoAssetId);

  if (availableAssets.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有可绑定的视频素材" />;
  }

  return (
    <div className="video-tab">
      <label>
        <span>绑定视频</span>
        <select
          aria-label="绑定视频"
          value={videoAssetId ?? ''}
          onChange={(event) => onChange(event.target.value || null)}
        >
          <option value="">暂不绑定</option>
          {availableAssets.map((asset) => (
            <option key={asset.id} value={asset.id}>{asset.fileName}</option>
          ))}
        </select>
      </label>
      {selectedAsset && (
        <div className="video-tab__preview">
          <video controls preload="metadata" src={selectedAsset.url} aria-label={`${selectedAsset.fileName} 预览`} />
          <div>
            <span>{selectedAsset.fileName}</span>
            <Button danger size="small" onClick={() => onChange(null)}>解除绑定</Button>
          </div>
        </div>
      )}
    </div>
  );
}
