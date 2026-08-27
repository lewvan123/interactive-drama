import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('../fixtures/sample.mp4', import.meta.url));

test('creator builds, saves and validates a linear draft', async ({ page }) => {
  const title = `全球冰封 E2E ${Date.now()}`;
  await page.goto('/studio');

  await page.getByRole('button', { name: '新建互动短剧' }).click();
  await page.getByLabel('作品名称').fill(title);
  await page.getByRole('button', { name: '创建作品' }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  await page.getByText('视频素材', { exact: true }).click();
  await page.getByLabel('上传视频文件').setInputFiles(fixture);
  await expect(page.getByText('sample.mp4', { exact: true })).toBeVisible({ timeout: 20_000 });

  await page.getByText('剧情编排', { exact: true }).click();
  const firstNode = page.locator('.react-flow__node').filter({ hasText: '剧情节点 1' });
  await firstNode.click();
  await page.getByRole('button', { name: '从剧情节点 1添加分支' }).click();
  const secondNode = page.locator('.react-flow__node').filter({ hasText: '剧情节点 2' });
  await expect(firstNode).toBeVisible();
  await expect(secondNode).toBeVisible();

  await secondNode.click();
  await page.getByLabel('节点类型').selectOption('ending');
  await page.getByLabel('节点剧本').fill('救援队最终抵达避难所。');

  await firstNode.click();
  await page.getByLabel('节点剧本').fill('全球骤然冰封，主角必须立刻作出选择。');
  await page.getByRole('tab', { name: '视频' }).click();
  await page.getByLabel('绑定视频').selectOption({ label: 'sample.mp4' });

  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(page.getByText('分支 1', { exact: true })).toHaveCount(0);
  await expect(page.getByText('已保存')).toBeVisible({ timeout: 10_000 });

  await page.reload();
  await expect(page.getByText('剧情节点 1', { exact: true })).toBeVisible();
  await expect(page.getByText('剧情节点 2', { exact: true })).toBeVisible();
  await page.locator('.react-flow__node').filter({ hasText: '剧情节点 1' }).click();
  await expect(page.getByLabel('节点剧本')).toHaveValue('全球骤然冰封，主角必须立刻作出选择。');

  await page.getByText('预览发布', { exact: true }).click();
  await expect(page.getByText('发布检查已通过')).toBeVisible({ timeout: 10_000 });
});
