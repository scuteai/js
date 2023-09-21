"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  type PaginationState,
  useReactTable,
  getFilteredRowModel,
  getSortedRowModel,
} from "@tanstack/react-table";
import type { ScuteEvent, ScutePaginationMeta } from "@/types";
import styles from "@/styles/Table.module.scss";
import { shortString } from "@/utils/string";
import { Code, Flex, IconButton, Kbd, Tooltip } from "@radix-ui/themes";
import { toast } from "sonner";
import { CopyIcon } from "@radix-ui/react-icons";

interface ActivityTableProps {
  events: ScuteEvent[];
  pagination: ScutePaginationMeta;
}

const paginationDefaults = {
  pageIndex: 0,
  pageSize: 10,
} as const satisfies PaginationState;

const columnHelper = createColumnHelper<ScuteEvent>();

export const ActivitiyTable = ({
  events,
  pagination: paginationMeta,
}: ActivityTableProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [columns] = useState(() => [
    columnHelper.accessor("user.id", {
      cell: (info) => (
        <Flex gap="1">
          <Tooltip content={info.getValue()}>
            <Kbd size="1">{shortString(info.getValue() as string, 8)}</Kbd>
          </Tooltip>
          <IconButton
            color="gray"
            size="1"
            variant="ghost"
            onClick={() =>
              navigator.clipboard
                .writeText(info.getValue() as string)
                .then(() => {
                  toast.success("Copied!");
                })
            }
          >
            <CopyIcon />
          </IconButton>
        </Flex>
      ),
      header: () => <span>User ID</span>,
    }),
    columnHelper.accessor("user.email", {
      header: () => <span>Email</span>,
    }),
    columnHelper.accessor("slug", {
      cell: (info) => (
        <Code size="1" color="blue" variant="soft" weight="light">
          {info.getValue()}
        </Code>
      ),
      header: () => <span>Action</span>,
    }),
    columnHelper.accessor("created_at", {
      header: () => <span>Created At</span>,
    }),
  ]);

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: searchParams.has("page")
      ? Number(searchParams.get("page")) - 1
      : paginationDefaults.pageIndex,
    pageSize: searchParams.has("limit")
      ? Number(searchParams.get("limit"))
      : paginationDefaults.pageSize,
  });

  const [globalFilter, setGlobalFilter] = useState<any>(searchParams.get("q"));
  useEffect(() => {
    setGlobalFilter(searchParams.get("q"));
  }, [searchParams]);

  const handlePaginationChange = (pagination: PaginationState) => {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(pagination.pageIndex + 1));
    params.set("limit", String(pagination.pageSize));

    startTransition(() => {
      router.replace(`${pathname}?${params}`);
    });
  };

  const table = useReactTable({
    data: events,
    columns,
    state: {
      pagination,
      globalFilter,
    },
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    onPaginationChange: (updater) => {
      let newPagination: PaginationState;
      if (typeof updater === "function") {
        newPagination = updater(pagination);
      } else {
        newPagination = updater;
      }
      setPagination(newPagination);
      handlePaginationChange(newPagination);
    },
    pageCount: paginationMeta.total_pages,
    // TODO: backend
    //manualFiltering: true,
    getFilteredRowModel: getFilteredRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <>
      <table className={styles.table}>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  colSpan={header.colSpan}
                  className={styles.th}
                >
                  {header.isPlaceholder ? null : (
                    <div
                      {...{
                        className: header.column.getCanSort()
                          ? "cursor-pointer select-none"
                          : "",
                        onClick: header.column.getToggleSortingHandler(),
                      }}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {{
                        asc: " 🔼",
                        desc: " 🔽",
                      }[header.column.getIsSorted() as string] ?? null}
                    </div>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className={styles.tbody}>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className={styles.tr}>
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className={styles.td}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {isPending && <div>...</div>}
      <div className="h-2" />
      <div className="flex items-center gap-2">
        <button
          className="border rounded p-1"
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
        >
          {"<<"}
        </button>
        <button
          className="border rounded p-1"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          {"<"}
        </button>
        <button
          className="border rounded p-1"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          {">"}
        </button>
        <button
          className="border rounded p-1"
          onClick={() => table.setPageIndex(table.getPageCount() - 1)}
          disabled={!table.getCanNextPage()}
        >
          {">>"}
        </button>
        <span className="flex items-center gap-1">
          <div>Page</div>
          <strong>
            {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </strong>
        </span>
        <span className="flex items-center gap-1">
          | Go to page:
          <input
            type="number"
            defaultValue={table.getState().pagination.pageIndex + 1}
            onChange={(e) => {
              const page = e.target.value ? Number(e.target.value) - 1 : 0;
              table.setPageIndex(page);
            }}
            className="border p-1 rounded w-16"
          />
        </span>
        <select
          value={table.getState().pagination.pageSize}
          onChange={(e) => {
            table.setPageSize(Number(e.target.value));
          }}
        >
          {[10, 20, 30, 40, 50].map((pageSize) => (
            <option key={pageSize} value={pageSize}>
              Show {pageSize}
            </option>
          ))}
        </select>
      </div>
      <div>{table.getRowModel().rows.length} Rows</div>
    </>
  );
};
