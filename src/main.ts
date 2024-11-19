import { asyncForEach, LogCategory, Logger } from '@koralabs/kora-labs-common';
import { Ok, Result } from 'ts-res';
import _ from 'lodash';

import { Status } from './entrypoint.js';
import { fetchAllHandleNames, fetchHandle, fetchHandles } from './handles.js';
import { Monitor } from './monitor.js';
import { resolveHandle, resolveHandles } from './resolve.js';
import { ResolvedHandle } from 'types.js';

/// constants
const oneDayInMilliseconds = 86400000;
const parallel = 5;
const thresholdTime = 60 * 1000; /// 60 seconds
const checkQueueInterval = 5 * 1000; /// 30 seconds

/// queue
const queues: ResolvedHandle[] = [];

const checkResolvedHandle = (resolvedHandle: ResolvedHandle) => {
  const { name, oldResolvedAddress, newResolvedAddress, blockTime } =
    resolvedHandle;

  if (oldResolvedAddress != newResolvedAddress) {
    if (Math.abs(Date.now() - blockTime) < thresholdTime) {
      queues.push(resolvedHandle);
      Logger.log({
        message: `"${name}" resolved to new address within threshold. Pushed to queue`,
        category: LogCategory.NOTIFY,
        event: 'HandleAddressResolver.queueNewResolvedAddress',
      });
    } else {
      Logger.log({
        message: `"${name}" resolved to new address.\nfrom: ${oldResolvedAddress}\nto: ${newResolvedAddress}`,
        category: LogCategory.NOTIFY,
        event: 'HandleAddressResolver.newResolvedAddress',
      });
    }
  }
};

const checkQueue = async () => {
  if (queues.length > 0 && queues[0].blockTime + thresholdTime < Date.now()) {
    const oldest = queues.shift();
    if (!oldest) return;
    const { name } = oldest;

    /// fetch from db
    const handleDataResult = await fetchHandle(name);
    if (!handleDataResult.ok) {
      Logger.log({
        message: handleDataResult.error,
        category: LogCategory.ERROR,
        event: 'HandleAddressResolver.resolveHandleInQueue',
      });
      /// push at the end, when error occurs
      queues.push(oldest);
      return;
    }

    /// resolve on chain data (in case, handle resolved to new address within threshold)
    const resolvedHandleResult = await resolveHandle(handleDataResult.data);
    if (!resolvedHandleResult.ok) {
      Logger.log({
        message: resolvedHandleResult.error,
        category: LogCategory.ERROR,
        event: 'HandleAddressResolver.resolveHandleInQueue',
      });
      /// push at the end, when error occurs
      queues.push(oldest);
      return;
    }

    checkResolvedHandle(resolvedHandleResult.data);
  }
};

const resolvePerPage = async (page: number): Promise<void> => {
  const handlesDataResult = await fetchHandles(page, parallel);

  if (!handlesDataResult.ok) {
    Logger.log({
      message: handlesDataResult.error,
      category: LogCategory.ERROR,
      event: 'HandleAddressResolver.fetchHandles',
    });
    return;
  }

  const handlesData = handlesDataResult.data;
  const resolvedHandlesResult = await resolveHandles(handlesData);

  if (!resolvedHandlesResult.ok) {
    Logger.log({
      message: resolvedHandlesResult.error,
      category: LogCategory.ERROR,
      event: 'HandleAddressResolver.resolveHandles',
    });
    return;
  }

  const resolvedHandles = resolvedHandlesResult.data;

  resolvedHandles.forEach(checkResolvedHandle);
};

const main = async (): Promise<Result<Status, string>> => {
  const monitor = new Monitor();

  /// check queue every interval
  setInterval(checkQueue, checkQueueInterval);

  /// resolve current page's handles
  while (!monitor.finished()) {
    /// fetch all handle names and calculate asyncEach time
    const allHandleNamesResult = await fetchAllHandleNames();
    if (!allHandleNamesResult.ok) {
      Logger.log({
        message: allHandleNamesResult.error,
        category: LogCategory.ERROR,
        event: 'HandleAddressResolver.fetchAllHandleNames',
      });

      await monitor.sleep(10, 20);
      continue;
    }

    const handlesTotalCount = allHandleNamesResult.data.length;
    const asyncEachTime = Math.floor(
      (oneDayInMilliseconds / Math.max(1, handlesTotalCount)) * parallel
    );
    const parallelCount = Math.ceil(handlesTotalCount / parallel);

    Logger.log({
      message: `Resolve ${parallel} Handles every ${asyncEachTime} ms`,
      category: LogCategory.INFO,
      event: 'HandleAddressResolver.asyncEachTime',
    });

    await asyncForEach(
      Array.from({ length: parallelCount }),
      async (_, index) => {
        await resolvePerPage(index + 1);
      },
      asyncEachTime
    );
  }

  return Ok(Status.Success);
};

export default main;
