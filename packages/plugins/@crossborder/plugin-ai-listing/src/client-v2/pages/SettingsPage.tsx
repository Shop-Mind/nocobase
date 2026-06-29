/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import React from 'react';
import { ListingPageErrorBoundary } from '../components/ListingPageErrorBoundary';
import { PagePlaceholder } from '../components/ui';

// 插件设置页，位于 /v2/admin/settings/ai-listing，渲染在后台设置布局内，不套用 ListingShell。
export default function ListingSettingsPage() {
  return (
    <ListingPageErrorBoundary>
      <PagePlaceholder
        title="设置"
        description="设置页将展示平台账号状态、默认平台 / 规则、Crawl4AI 与 OpenAPI 状态"
        upcoming={[
          '平台账号授权状态（不展示密钥）',
          '默认平台 / 默认规则',
          'Crawl4AI 开关与 OpenAPI 状态（Phase 9 / 11）',
        ]}
      />
    </ListingPageErrorBoundary>
  );
}
