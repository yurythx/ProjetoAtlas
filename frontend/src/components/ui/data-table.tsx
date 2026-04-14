"use client"

import * as React from "react"
import {
  ColumnDef,
  ColumnFiltersState,
  OnChangeFn,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown, Loader2 } from "lucide-react"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  isLoading?: boolean
  searchKey?: string
  searchPlaceholder?: string
  onRowClick?: (row: TData) => void
  getRowClassName?: (row: TData) => string | undefined
  getRowAriaLabel?: (row: TData) => string | undefined
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  columnVisibility?: VisibilityState
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>
}

function DataTableInner<TData, TValue>({
  columns,
  data,
  isLoading = false,
  searchKey,
  searchPlaceholder = "Filter...",
  onRowClick,
  getRowClassName,
  getRowAriaLabel,
  sorting: controlledSorting,
  onSortingChange: controlledOnSortingChange,
  columnVisibility: controlledColumnVisibility,
  onColumnVisibilityChange: controlledOnColumnVisibilityChange,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState({})
  const resolvedSorting = controlledSorting ?? sorting
  const resolvedColumnVisibility = controlledColumnVisibility ?? columnVisibility

  const handleSortingChange = React.useCallback<OnChangeFn<SortingState>>(
    (updater) => {
      if (controlledOnSortingChange) {
        controlledOnSortingChange(updater)
        return
      }
      setSorting(updater)
    },
    [controlledOnSortingChange]
  )

  const handleColumnVisibilityChange = React.useCallback<OnChangeFn<VisibilityState>>(
    (updater) => {
      if (controlledOnColumnVisibilityChange) {
        controlledOnColumnVisibilityChange(updater)
        return
      }
      setColumnVisibility(updater)
    },
    [controlledOnColumnVisibilityChange]
  )

  const table = useReactTable({
    data,
    columns,
    onSortingChange: handleSortingChange,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting: resolvedSorting,
      columnFilters,
      columnVisibility: resolvedColumnVisibility,
      rowSelection,
    },
  })

  const onSearchChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!searchKey) return
      const col = table.getColumn(searchKey)
      if (col) col.setFilterValue(event.target.value)
    },
    [table, searchKey]
  )

  const toggleColumnVisibility = React.useCallback(
    (id: string, value: boolean) => {
      const col = table.getColumn(id)
      if (col) col.toggleVisibility(!!value)
    },
    [table]
  )

  return (
    <div className="w-full space-y-4">
      {/* Filters and Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {searchKey && (
          <div className="flex items-center">
            <Input
              placeholder={searchPlaceholder}
              value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ""}
              onChange={onSearchChange}
              className="w-full sm:max-w-sm"
              role="searchbox"
              aria-label={searchPlaceholder || "Filtrar resultados"}
            />
          </div>
        )}
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="sm:ml-auto" aria-label="Alternar colunas visíveis">
              Columns <ChevronDown className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                const isVisible = column.getIsVisible()
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={isVisible}
                    onCheckedChange={(value) => toggleColumnVisibility(column.id, !!value)}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                )
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table Content */}
      <div className="rounded-md border bg-card overflow-x-auto">
        <Table aria-label="Tabela de resultados">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
               <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  <div className="flex items-center justify-center gap-2 text-muted-foreground" role="status" aria-live="polite" aria-label="Carregando dados da tabela">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Carregando dados...
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={onRowClick ? `cursor-pointer ${getRowClassName?.(row.original) ?? ""}` : getRowClassName?.(row.original)}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onKeyDown={onRowClick ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      onRowClick(row.original)
                    }
                  } : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-label={getRowAriaLabel?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  <div role="status" aria-live="polite">Nenhum resultado.</div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Página anterior"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Próxima página"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}

export function DataTable<TData, TValue>(props: DataTableProps<TData, TValue>) {
  return <DataTableInner {...props} />
}
