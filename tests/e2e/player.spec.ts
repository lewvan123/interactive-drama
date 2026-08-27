import { expect, test, type APIRequestContext } from '@playwright/test';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('../fixtures/sample.mp4', import.meta.url));

type Asset = {
  id: string;
  fileName: string;
  objectKey: string;
  url: string;
  duration: number;
  status: 'available';
};

async function uploadVideo(
  request: APIRequestContext,
  projectId: string,
  fileName: string,
): Promise<Asset> {
  const file = await readFile(fixture);
  const info = await stat(fixture);
  const targetResponse = await request.post(`/api/projects/${projectId}/assets/upload-target`, {
    data: { fileName, contentType: 'video/mp4', size: info.size, duration: 1 },
  });
  expect(targetResponse.ok()).toBeTruthy();
  const target = await targetResponse.json() as {
    asset: Asset;
    uploadUrl: string;
    headers: Record<string, string>;
  };
  const uploadResponse = await request.put(target.uploadUrl, {
    data: file,
    headers: target.headers,
  });
  expect(uploadResponse.ok()).toBeTruthy();
  return target.asset;
}

async function publishTwoNodeStory(request: APIRequestContext) {
  const createdResponse = await request.post('/api/projects', {
    data: { title: `全球冰封 H5 ${Date.now()}` },
  });
  const created = await createdResponse.json() as {
    project: { id: string };
    draft: { id: string; title: string; updatedAt: string };
  };
  const startAsset = await uploadVideo(request, created.project.id, 'start.mp4');
  const endingAsset = await uploadVideo(request, created.project.id, 'ending.mp4');
  const draft = {
    ...created.draft,
    startNodeId: 'start',
    assets: [startAsset, endingAsset],
    nodes: [
      {
        id: 'start',
        title: '冰封来临',
        type: 'normal',
        scriptText: '气温骤降，所有出口都被冰封。',
        videoAssetId: startAsset.id,
        position: { x: 0, y: 0 },
        choices: [{ id: 'move-on', text: '穿过风雪', targetNodeId: 'ending', order: 0 }],
      },
      {
        id: 'ending',
        title: '冰封尽头',
        type: 'ending',
        scriptText: '主角终于抵达安全区。',
        videoAssetId: endingAsset.id,
        position: { x: 320, y: 0 },
        choices: [],
      },
    ],
  };
  const saveResponse = await request.put(`/api/projects/${created.project.id}/draft`, { data: draft });
  expect(saveResponse.ok()).toBeTruthy();
  const publishResponse = await request.post(`/api/projects/${created.project.id}/publish`);
  expect(publishResponse.status()).toBe(201);
  return { projectId: created.project.id, startAsset, endingAsset };
}

test('H5 player main flow', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const story = await publishTwoNodeStory(request);
  await page.goto(`/play/${story.projectId}`);

  await expect(page.getByRole('button', { name: '开始体验' })).toBeVisible();
  await page.getByLabel('剧情视频').evaluate((video) => { video.loop = true; });
  await page.getByRole('button', { name: '开始体验' }).click();
  await expect(page.getByRole('button', { name: '开始体验' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '暂停' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '静音' })).toHaveCount(0);
  const player = page.locator('main.interactive-player');
  await player.click({ position: { x: 195, y: 420 } });
  await expect.poll(() => page.getByLabel('剧情视频').evaluate((video) => video.paused)).toBe(true);
  await player.click({ position: { x: 195, y: 420 } });
  await expect.poll(() => page.getByLabel('剧情视频').evaluate((video) => video.paused)).toBe(false);

  await page.getByLabel('剧情视频').evaluate((element) => {
    element.dispatchEvent(new Event('ended'));
  });
  await expect(page.getByLabel('剧情视频')).toHaveAttribute('src', story.endingAsset.url);
  await expect(page.getByText('你会怎么选？')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '穿过风雪' })).toHaveCount(0);

  await page.getByLabel('剧情视频').evaluate((element) => {
    element.dispatchEvent(new Event('ended'));
  });
  await expect(page.getByText('已到达结局')).toBeVisible();
  await expect(page.getByText('已探索 2 / 2')).toBeVisible();
  await page.getByRole('button', { name: '查看剧情图谱' }).click();
  const storyMap = page.getByRole('region', { name: '剧情图谱' });
  await expect(storyMap.getByText('冰封来临', { exact: true })).toBeVisible();
  await expect(storyMap.getByText('冰封尽头', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '关闭剧情图谱' }).click();
  await page.reload();
  await expect(page.getByText('冰封尽头', { exact: true })).toBeVisible();
  await expect(page.getByLabel('剧情视频')).toHaveAttribute('src', story.endingAsset.url);
});

test('H5 player controls stay inside compact portrait and landscape viewports', async ({ page, request }) => {
  const story = await publishTwoNodeStory(request);
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`/play/${story.projectId}`);
    const mapButton = page.getByRole('button', { name: '剧情图谱' });
    const box = await mapButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

  }
});
