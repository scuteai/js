"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type PaginationState,
  type ColumnFiltersState,
  Column,
  Table,
} from "@tanstack/react-table";

import type {
  ScuteUserData,
  ScutePaginationMeta,
  UniqueIdentifier,
} from "@/types";

import { shortString } from "@/utils/string";
import { toast } from "sonner";
import { Badge, Flex, IconButton, Kbd, Tooltip } from "@radix-ui/themes";
import styles from "@/styles/Table.module.scss";
import { CopyIcon } from "@radix-ui/react-icons";
import { AppUserActions } from "./AppUserActions";

export interface UsersTableProps {
  appId: UniqueIdentifier;
  users: ScuteUserData[];
  pagination: ScutePaginationMeta;
  activateUser: (id: UniqueIdentifier) => Promise<any>;
  deactivateUser: (id: UniqueIdentifier) => Promise<any>;
}

const paginationDefaults = {
  pageIndex: 0,
  pageSize: 10,
} as const satisfies PaginationState;

const columnHelper = createColumnHelper<ScuteUserData>();

export const UsersTable = ({
  appId,
  users,
  activateUser,
  deactivateUser,
  pagination: paginationMeta,
}: UsersTableProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [isPending, startTransition] = useTransition();

  const [columns] = useState(() => [
    columnHelper.accessor("id", {
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
    columnHelper.accessor("email", {
      header: () => <span>Email</span>,
    }),
    columnHelper.accessor("last_used_at", {
      header: () => <span>Last login</span>,
      enableColumnFilter: false,
    }),
    columnHelper.accessor("signup_date", {
      header: () => <span>Signup date</span>,
    }),
    columnHelper.accessor("status", {
      header: () => <span>Active</span>,
      cell: (props) => {
        const status = props.getValue();
        return (
          <Flex>
            <Badge radius="full" color={status === "active" ? "green" : "red"}>
              {status}
            </Badge>
          </Flex>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      cell: (props) => (
        <AppUserActions
          appId={appId}
          user={props.row.original}
          activateUser={activateUser}
          deactivateUser={deactivateUser}
        />
      ),
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

  const handlePaginationChange = (pagination: PaginationState) => {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(pagination.pageIndex + 1));
    params.set("limit", String(pagination.pageSize));

    startTransition(() => {
      router.replace(`${pathname}?${params}`);
    });
  };

  const [globalFilter, setGlobalFilter] = useState<any>(searchParams.get("q"));
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  useEffect(() => {
    setGlobalFilter(searchParams.get("q"));
    const columnFilters: ColumnFiltersState = [];
    searchParams.forEach((value, id) => {
      columnFilters.push({
        id,
        value,
      });
    });
    setColumnFilters(columnFilters);
  }, [searchParams]);

  const handleColumnFiltersChange = (columnFilters: ColumnFiltersState) => {
    const params = new URLSearchParams(window.location.search);
    table.getAllColumns().forEach((column) => {
      if (column.getCanFilter()) {
        params.delete(column.id);
      }
    });

    columnFilters.forEach((columnFilter) => {
      let id: string = columnFilter.id;
      if (columnFilter.id === "signup_date") {
        id = "created_before";
      }
      params.set(id, columnFilter.value as string);
    });

    startTransition(() => {
      router.replace(`${pathname}?${params}`);
    });
  };

  const table = useReactTable({
    data: users,
    columns,
    state: {
      pagination,
      columnFilters,
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
    manualFiltering: true,
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: (updater) => {
      let newColumnFilters: ColumnFiltersState;
      if (typeof updater === "function") {
        newColumnFilters = updater(columnFilters);
      } else {
        newColumnFilters = updater;
      }
      setColumnFilters(newColumnFilters);
      handleColumnFiltersChange(newColumnFilters);
    },
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <>
      <table>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    className={styles.th}
                  >
                    {header.isPlaceholder ? null : (
                      <>
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
                        {header.column.getCanFilter() ? (
                          <div>
                            <Filter column={header.column} table={table} />
                          </div>
                        ) : null}
                      </>
                    )}
                  </th>
                );
              })}
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

function Filter({
  column,
  table,
}: {
  column: Column<any, unknown>;
  table: Table<any>;
}) {
  const firstValue = table
    .getPreFilteredRowModel()
    .flatRows[0]?.getValue(column.id);

  const columnFilterValue = column.getFilterValue();

  const sortedUniqueValues = useMemo(
    () =>
      typeof firstValue === "number"
        ? []
        : Array.from(column.getFacetedUniqueValues().keys()).sort(),
    [column.getFacetedUniqueValues()]
  );

  return typeof firstValue === "number" ? (
    <div>
      <div className="flex space-x-2">
        <input
          type="number"
          min={Number(column.getFacetedMinMaxValues()?.[0] ?? "")}
          max={Number(column.getFacetedMinMaxValues()?.[1] ?? "")}
          value={(columnFilterValue as [number, number])?.[0] ?? ""}
          onChange={(e) => {
            const value = e.target.value;
            column.setFilterValue((old: [number, number]) => [value, old?.[1]]);
          }}
          placeholder={`Min ${
            column.getFacetedMinMaxValues()?.[0]
              ? `(${column.getFacetedMinMaxValues()?.[0]})`
              : ""
          }`}
          className="w-24 border shadow rounded"
        />
        <input
          type="number"
          min={Number(column.getFacetedMinMaxValues()?.[0] ?? "")}
          max={Number(column.getFacetedMinMaxValues()?.[1] ?? "")}
          value={(columnFilterValue as [number, number])?.[1] ?? ""}
          onChange={(e) => {
            const value = e.target.value;
            column.setFilterValue((old: [number, number]) => [old?.[0], value]);
          }}
          placeholder={`Max ${
            column.getFacetedMinMaxValues()?.[1]
              ? `(${column.getFacetedMinMaxValues()?.[1]})`
              : ""
          }`}
          className="w-24 border shadow rounded"
        />
      </div>
    </div>
  ) : (
    <>
      <datalist id={column.id + "list"}>
        {sortedUniqueValues.slice(0, 5000).map((value: any) => (
          <option value={value} key={value} />
        ))}
      </datalist>
      <input
        type="text"
        value={(columnFilterValue ?? "") as string}
        onChange={(e) => {
          const value = e.target.value;
          column.setFilterValue(value);
        }}
        //placeholder={`Search... (${column.getFacetedUniqueValues().size})`}
        placeholder={`Search...`}
        className="w-36 border shadow rounded"
        list={column.id + "list"}
      />
      <div className="h-1" />
    </>
  );
}
